import express from 'express'
import cors from 'cors'
import { Job } from 'bullmq'
import { codeExecutionQueue } from './config/queue.js'

const app = express()
const PORT = process.env.WORKER_PORT || 5001

app.use(cors({
    origin: [
        'http://localhost:3000',
        'https://getplaced.tech',
        'https://www.getplaced.tech'
    ],
    credentials: true
}))

app.use(express.json())

app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        service: 'dsa-worker',
        timestamp: new Date().toISOString()
    })
})

app.get('/api/queue/stats', async (req, res) => {
    try {
        const counts = await codeExecutionQueue.getJobCounts('wait', 'active', 'completed', 'failed', 'delayed')
        res.json({
            ok: true,
            active: counts.active,
            waiting: counts.wait,
            delayed: counts.delayed,
            completed: counts.completed,
            failed: counts.failed
        })
    } catch (error) {
        res.status(500).json({ ok: false, error: error.message })
    }
})

app.get('/api/queue/jobs', async (req, res) => {
    try {
        const jobs = await codeExecutionQueue.getJobs(['wait', 'active', 'delayed', 'completed', 'failed'], 0, 50)
        const jobData = await Promise.all(jobs.map(async job => {
            const state = await job.getState()
            return {
                id: job.id,
                name: job.name,
                state: state,
                data: job.data,
                failedReason: job.failedReason,
                timestamp: job.timestamp,
                processedOn: job.processedOn,
                finishedOn: job.finishedOn,
                progress: job.progress
            }
        }))
        res.json({
            ok: true,
            jobs: jobData
        })
    } catch (error) {
        res.status(500).json({ ok: false, error: error.message })
    }
})

app.get('/api/status/:jobId', async (req, res) => {
    const { jobId } = req.params
    const timestamp = new Date().toISOString()

    console.log(`[${timestamp}] 📊 Status request for job: ${jobId}`)

    try {
        const job = await Job.fromId(codeExecutionQueue, jobId)

        if (!job) {
            console.log(`[${timestamp}] ❌ Job not found: ${jobId}`)
            return res.status(404).json({
                success: false,
                found: false,
                message: 'Job not found'
            })
        }

        // Get job state and data
        const state = await job.getState()
        const progress = job.progress || 0

        console.log(`[${timestamp}] ✅ Job ${jobId}: state=${state}, progress=${progress}%`)

        const response = {
            success: true,
            found: true,
            jobId: job.id,
            status: state,
            progress,
            timestamp
        }

        if (state === 'completed') {
            response.result = job.returnvalue
            console.log(`[${timestamp}] 🎉 Job ${jobId} completed successfully`)
        }

        if (state === 'failed') {
            response.error = job.failedReason
            response.stacktrace = job.stacktrace
            console.log(`[${timestamp}] ❌ Job ${jobId} failed: ${job.failedReason}`)
        }

        res.json(response)

    } catch (error) {
        console.error(`[${timestamp}] ❌ Error fetching job status:`, error.message)
        res.status(500).json({
            success: false,
            message: 'Error fetching job status',
            error: error.message
        })
    }
})

// Start server
app.listen(PORT, () => {
    console.log(`\n🚀 Worker API Server running on port ${PORT}`)
    console.log(`📊 Status endpoint: http://localhost:${PORT}/api/status/:jobId`)
    console.log(`🏥 Health check: http://localhost:${PORT}/health\n`)
})

export default app
