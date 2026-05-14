import dotenv from 'dotenv'
dotenv.config()

import { Worker } from 'bullmq'
import mongoose from 'mongoose'
import fetch from 'node-fetch'
import { connection } from './config/redis.js'
import { sendJobMatchEmail, sendCustomEmail } from './services/email.js'

// ── MongoDB Models (inline schemas — worker is read-heavy) ───────────────────
import { createRequire } from 'module'

const ML_SERVICE_URL   = process.env.ML_SERVICE_URL    || 'http://localhost:5002'
const THRESHOLD        = parseFloat(process.env.ML_MATCH_THRESHOLD) || 0.65
const BATCH_SIZE       = parseInt(process.env.ML_BATCH_SIZE)        || 20
const MONGODB_URI      = process.env.MONGODB_URI

// ── Mongoose connection ───────────────────────────────────────────────────────
async function connectMongo() {
    if (mongoose.connection.readyState !== 0) return
    await mongoose.connect(MONGODB_URI)
    console.log('✅ ML Worker MongoDB connected')
}

// Inline models to avoid circular imports from backend
const jobSchema = new mongoose.Schema({ title: String, company: String, description: String, url: String, isActive: Boolean }, { strict: false })
const recommendationSchema = new mongoose.Schema({
    userId: mongoose.Schema.Types.ObjectId,
    jobId:  mongoose.Schema.Types.ObjectId,
    matchScore: Number, isRecommended: Boolean,
    isViewed: Boolean, isSaved: Boolean, isApplied: Boolean,
    batchDate: Date,
}, { strict: false })
recommendationSchema.index({ userId: 1, jobId: 1, batchDate: 1 }, { unique: true })

const Job              = mongoose.models.Job              || mongoose.model('Job',              jobSchema)
const JobRecommendation = mongoose.models.JobRecommendation || mongoose.model('JobRecommendation', recommendationSchema)
const Resume           = mongoose.models.Resume           || mongoose.model('Resume',           new mongoose.Schema({ userId: mongoose.Schema.Types.ObjectId, cleanedText: String, rawText: String }, { strict: false }))
const User             = mongoose.models.User             || mongoose.model('User',             new mongoose.Schema({ email: String, name: String, isActive: Boolean }, { strict: false }))

// ── Helper: chunk array into batches ─────────────────────────────────────────
function chunk(arr, size) {
    const out = []
    for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
    return out
}

// ── Core processor ───────────────────────────────────────────────────────────
/**
 * Process one BullMQ task.
 * Job data shape: { userId, jobIds, batchDate }
 */
async function processEvaluationTask(bullJob) {
    const { userId, jobIds, batchDate } = bullJob.data
    await connectMongo()

    console.log(`\n[Worker] 🤖 Evaluating user ${userId} against ${jobIds.length} jobs`)
    await bullJob.updateProgress(5)

    // 1. Load user + resume
    const [user, resume] = await Promise.all([
        User.findById(userId).lean(),
        Resume.findOne({ userId }).sort({ createdAt: -1 }).lean(),
    ])

    if (!resume?.cleanedText && !resume?.rawText) {
        console.warn(`[Worker] ⚠️  No resume for user ${userId} — skipping`)
        return { skipped: true, reason: 'no resume' }
    }

    const resumeText = resume.cleanedText || resume.rawText
    await bullJob.updateProgress(15)

    // 2. Load jobs from MongoDB
    const jobs = await Job.find({ _id: { $in: jobIds }, isActive: true }).lean()
    if (!jobs.length) return { skipped: true, reason: 'no active jobs' }

    await bullJob.updateProgress(25)

    // 3. Call Python ML service in batches
    const batches = chunk(jobs, BATCH_SIZE)
    const allResults = []
    let batchNum = 0

    for (const batch of batches) {
        batchNum++
        console.log(`[Worker] Batch ${batchNum}/${batches.length} — ${batch.length} jobs`)

        const response = await fetch(`${ML_SERVICE_URL}/api/jobs/evaluate-batch`, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({
                resumeText,
                jobs: batch.map(j => ({ _id: j._id.toString(), title: j.title, description: j.description })),
            }),
            timeout: 60_000,
        })

        if (!response.ok) {
            const err = await response.text()
            throw new Error(`ML service error (${response.status}): ${err}`)
        }

        const data = await response.json()
        allResults.push(...(data.results || []))

        const progress = 25 + Math.round((batchNum / batches.length) * 55)
        await bullJob.updateProgress(progress)
    }

    // 4. Filter recommendations above threshold & bulk upsert
    const batchDateObj = batchDate ? new Date(batchDate) : new Date()
    const jobMap = Object.fromEntries(jobs.map(j => [j._id.toString(), j]))

    const toUpsert  = allResults.filter(r => r.matchScore >= THRESHOLD)
    const emailJobs = []

    if (toUpsert.length > 0) {
        const ops = toUpsert.map(r => ({
            updateOne: {
                filter: { userId, jobId: r.jobId, batchDate: batchDateObj },
                update: {
                    $setOnInsert: { isViewed: false, isSaved: false, isApplied: false },
                    $set:         { matchScore: r.matchScore, isRecommended: true, batchDate: batchDateObj },
                },
                upsert: true,
            },
        }))
        await JobRecommendation.bulkWrite(ops)

        // Prepare email data
        for (const r of toUpsert) {
            const job = jobMap[r.jobId]
            if (job) emailJobs.push({ title: job.title, company: job.company, url: job.url, matchScore: r.matchScore })
        }
        emailJobs.sort((a, b) => b.matchScore - a.matchScore)
    }

    await bullJob.updateProgress(90)

    // 5. Send email
    if (user?.email && emailJobs.length > 0) {
        try {
            await sendJobMatchEmail(user, emailJobs)
        } catch (e) {
            console.error(`[Worker] ⚠️  Email failed for ${userId}:`, e.message)
            // Don't throw — email failure shouldn't fail the job
        }
    }

    await bullJob.updateProgress(100)

    console.log(`[Worker] ✅ Done — user ${userId}: ${toUpsert.length}/${jobs.length} recommended`)
    return {
        userId: userId.toString(),
        jobsEvaluated:  jobs.length,
        recommended:    toUpsert.length,
        emailSent:      emailJobs.length > 0,
    }
}

// ── Worker setup ─────────────────────────────────────────────────────────────
const worker = new Worker('ml-evaluation', processEvaluationTask, {
    connection,
    concurrency: 3,  // process 3 users simultaneously
    limiter: {
        max:      10,
        duration: 10_000,  // max 10 jobs per 10 seconds
    },
})

worker.on('completed', (job, result) => {
    console.log(`[Worker] ✅ Job ${job.id} completed:`, result)
})

worker.on('failed', (job, err) => {
    console.error(`[Worker] ❌ Job ${job?.id} failed:`, err.message)
})

worker.on('progress', (job, progress) => {
    if (progress % 25 === 0) console.log(`[Worker] 📊 Job ${job.id} progress: ${progress}%`)
})

console.log(`
╔════════════════════════════════════════╗
║   🤖 GetPlaced ML Worker Running      ║
║   Queue: ml-evaluation                ║
║   Threshold: ${THRESHOLD}                     ║
║   Batch Size: ${BATCH_SIZE}                    ║
║   ML Service: ${ML_SERVICE_URL.slice(0, 22)}  ║
╚════════════════════════════════════════╝
`)

// ── Bulk Email Worker setup ──────────────────────────────────────────────────
const emailWorker = new Worker('bulk-email', async (job) => {
    const { targetEmails, subject, html } = job.data
    console.log(`[Worker] 📧 Starting bulk email to ${targetEmails.length} users`)
    
    let sent = 0
    let failed = 0
    
    for (let i = 0; i < targetEmails.length; i++) {
        const success = await sendCustomEmail(targetEmails[i], subject, html)
        if (success) sent++
        else failed++
        
        await job.updateProgress(Math.round(((i + 1) / targetEmails.length) * 100))
    }
    
    return { sent, failed }
}, {
    connection,
    concurrency: 1 // send sequentially to avoid spam filters
})

emailWorker.on('completed', (job, result) => {
    console.log(`[Worker] 📧 Bulk email ${job.id} completed: ${result.sent} sent, ${result.failed} failed`)
})
emailWorker.on('failed', (job, err) => {
    console.error(`[Worker] ❌ Bulk email ${job?.id} failed:`, err.message)
})
