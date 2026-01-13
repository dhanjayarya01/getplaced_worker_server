import dotenv from "dotenv"
import Redis from 'ioredis'

dotenv.config()
console.log(process.env.REDIS_HOST)

// Redis connection for BullMQ worker - optimized for long-running jobs
export const connection = new Redis({
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT) || 6379,
    maxRetriesPerRequest: null, // Required for BullMQ
    enableReadyCheck: false,

    
    keepAlive: 30000,
    connectTimeout: 30000, 

 
    retryStrategy: (times) => {
        const delay = Math.min(times * 100, 3000) 
        console.log(`🔄 Redis reconnecting (attempt ${times})...`)
        return delay
    },

  
    reconnectOnError: (err) => {
        console.log('🔄 Redis reconnecting on error:', err.message)
        return true // Always reconnect
    },
})

connection.on('connect', () => {
    console.log('✅ Worker Redis connected')
})

connection.on('ready', () => {
    console.log('✅ Worker Redis ready')
})

connection.on('error', (err) => {
    console.error('❌ Worker Redis error:', err.message)
})

connection.on('close', () => {
    console.log('⚠️  Worker Redis connection closed')
})

connection.on('reconnecting', () => {
    console.log('🔄 Worker Redis reconnecting...')
})
