import { Queue } from 'bullmq'
import { connection } from './redis.js'

// Queue: backend pushes tasks here after job scraping
export const mlEvaluationQueue = new Queue('ml-evaluation', { connection })

console.log('✅ BullMQ Queue initialized: ml-evaluation')
