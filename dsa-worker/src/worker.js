import dotenv from 'dotenv'
import { Worker } from 'bullmq'
import { connection } from './config/redis.js'
import { codeExecutionQueue } from './config/queue.js'
import judge0Service from './models/services/judge0.service.js'
import codeWrapperService from './models/services/codeWrapper.service.js'
import { User, DSAProblem, Submission } from './models/index.js'
import Redis from 'ioredis'
import mongoose from 'mongoose'
import './server.js' // Start API server alongside worker

dotenv.config()

mongoose
    .connect(process.env.MONGODB_URI)
    .then(() => console.log('✅ MongoDB connected for worker'))
    .catch((error) => {
        console.error('❌ Worker MongoDB connection error:', error.message)
        process.exit(1)
    })

// Create separate Redis client for cache invalidation
const redis = new Redis({
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT) || 6379,
    // No password - server doesn't require it
    retryStrategy: () => null,
    enableOfflineQueue: false,
})

// Helper function to wrap code
const wrapCode = (code, language, problem) => {
    return codeWrapperService.wrapCode(problem, code, language)
}

// Helper function to invalidate user cache
async function invalidateUserCache(userId) {
    const keys = await redis.keys(`user:${userId}*`)
    if (keys.length > 0) {
        await redis.del(...keys)
    }
}

// Create code execution worker
const codeExecutionWorker = new Worker(
    'code-execution',
    async (job) => {
        const { problemId, code, language, testCases, userId, problem } = job.data

        const timestamp = () => `[${new Date().toISOString()}]`
        console.log(`${timestamp()} 🔵 STEP 0: Job received`)
        console.log(`${timestamp()}    Job ID: ${job.id}`)
        console.log(`${timestamp()}    Problem: ${problem?.title || 'UNKNOWN'}`)
        console.log(`${timestamp()}    Language: ${language}`)
        console.log(`${timestamp()}    User: ${userId}`)

        try {
            // Validate required data
            if (!code) {
                throw new Error('Code is missing from job data')
            }
            if (!language) {
                throw new Error('Language is missing from job data')
            }
            if (!problem || !problem._id) {
                throw new Error('Problem data is missing or invalid')
            }
            if (!testCases || testCases.length === 0) {
                throw new Error('Test cases are missing')
            }

            // Step 1: Wrap code
            console.log(`${timestamp()} 🔵 STEP 1: Wrapping code...`)
            const wrappedCode = wrapCode(code, language, problem)
            console.log(`${timestamp()} 🟢 STEP 1 COMPLETE: Code wrapped`)

            // Step 2: Submit to Judge0
            console.log(`${timestamp()} 🔵 STEP 2: Submitting to Judge0...`)

            const executionResult = await judge0Service.runTestCases(
                wrappedCode,
                language,
                testCases,
                problem.timeLimit,
                problem.memoryLimit
            )

            console.log(`${timestamp()} 🟢 STEP 2 COMPLETE: Judge0 execution finished`)
            console.log(`${timestamp()}    Passed: ${executionResult.passedTestCases}/${executionResult.totalTestCases}`)

            // Step 3: Determine submission status

            let submissionStatus = 'wrong-answer'
            if (executionResult.accepted) {
                submissionStatus = 'accepted'
            } else if (executionResult.testResults.some((r) => r.status === 'Time Limit Exceeded')) {
                submissionStatus = 'time-limit-exceeded'
            } else if (executionResult.testResults.some((r) => r.status === 'Compilation Error')) {
                submissionStatus = 'compilation-error'
            } else if (executionResult.testResults.some((r) => r.status?.includes('Runtime Error'))) {
                submissionStatus = 'runtime-error'
            }

            // Step 4: Save submission to database
            console.log(`${timestamp()} 🔵 STEP 4: Saving submission to DB...`)

            // Save submission to database
            const submission = await Submission.findOneAndUpdate(
                {
                    user: userId,
                    problemId: problem._id,
                    problemType: 'dsa',
                },
                {
                    code,
                    language,
                    status: submissionStatus,
                    testResults: executionResult.testResults,
                    totalTestCases: executionResult.totalTestCases,
                    passedTestCases: executionResult.passedTestCases,
                    executionTime: executionResult.executionTime,
                    memoryUsed: executionResult.memoryUsed,
                    isAccepted: executionResult.accepted,
                },
                { upsert: true, new: true }
            )

            console.log(`💾 Submission saved: ${submission._id}`)

            // Invalidate caches (non-blocking)
            try {
                await invalidateUserCache(userId)
                await redis.del(`dsa:problem:${problemId}:submissions:${userId}`)
                console.log(`🗑️ Cache invalidated`)
            } catch (cacheError) {
                console.warn(`⚠️ Cache invalidation failed (non-critical):`, cacheError.message)
            }

            console.log(`${timestamp()} 🟢 STEP 4 COMPLETE: Submission saved`)

            // Invalidate caches
            console.log(`${timestamp()} 🔵 STEP 5: Invalidating cache...`)

            console.log(`✅ Job ${job.id} completed successfully`)

            // Return result
            return {
                success: true,
                submissionId: submission._id,
                status: submissionStatus,
                accepted: executionResult.accepted,
                totalTestCases: executionResult.totalTestCases,
                passedTestCases: executionResult.passedTestCases,
                testResults: executionResult.testResults,
                executionTime: executionResult.executionTime,
                memoryUsed: executionResult.memoryUsed,
            }
        } catch (error) {
            console.error(`❌ Job ${job.id} failed:`, error.message)
            console.error(`❌ Error stack:`, error.stack)
            throw error // BullMQ will handle retry
        }
    },
    {
        connection,
        concurrency: 5, // Process 5 code submissions simultaneously
    }
)

// Event listeners
codeExecutionWorker.on('completed', (job, result) => {
    console.log(`✅ Job ${job.id} completed`)
    console.log(`   Status: ${result.status}`)
    console.log(`   Passed: ${result.passedTestCases}/${result.totalTestCases}`)
})

codeExecutionWorker.on('failed', (job, error) => {
    console.error(`❌ Job ${job.id} failed:`, error.message)
    console.error(`   Attempts: ${job.attemptsMade}/${job.opts.attempts}`)
})

codeExecutionWorker.on('error', (error) => {
    console.error('❌ Worker error:', error)
})

console.log('🚀 Code execution worker started')
console.log('   Concurrency: 5')
console.log('   Waiting for jobs...')

// Graceful shutdown
process.on('SIGTERM', async () => {
    console.log('📴 Shutting down worker...')
    await codeExecutionWorker.close()
    await redis.quit()
    process.exit(0)
})

process.on('SIGINT', async () => {
    console.log('📴 Shutting down worker...')
    await codeExecutionWorker.close()
    await redis.quit()
    process.exit(0)
})

export default codeExecutionWorker
