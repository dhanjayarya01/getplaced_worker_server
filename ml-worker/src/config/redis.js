import dotenv from 'dotenv'
import Redis from 'ioredis'
dotenv.config()

export const connection = new Redis({
    host:     process.env.REDIS_HOST || 'localhost',
    port:     parseInt(process.env.REDIS_PORT) || 6379,
    password: process.env.REDIS_PASSWORD || undefined,
    maxRetriesPerRequest: null,  // Required for BullMQ
    enableReadyCheck: false,
    retryStrategy: (times) => Math.min(times * 100, 3000),
})

connection.on('connect',  () => console.log('✅ ML Worker Redis connected'))
connection.on('error',    (e) => console.error('❌ ML Worker Redis error:', e.message))
