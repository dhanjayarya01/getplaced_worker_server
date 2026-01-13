import { Queue } from 'bullmq'
import { connection } from './redis.js'

// Code execution queue
export const codeExecutionQueue = new Queue('code-execution', {
    connection,
})

console.log('✅ BullMQ Queue initialized: code-execution')
