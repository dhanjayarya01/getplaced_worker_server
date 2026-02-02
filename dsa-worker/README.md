# DSA Worker - Code Execution Microservice

Background worker service for processing DSA code submissions with Judge0 integration.

## 🎯 Overview

Dedicated microservice that processes code execution jobs asynchronously using BullMQ queues. Handles code wrapping, Judge0 integration, test case validation, and result persistence.

## 🛠️ Tech Stack

- **Runtime**: Node.js with ES6 modules
- **Job Queue**: BullMQ (Redis-based)
- **Database**: MongoDB with Mongoose
- **Cache**: Redis (IORedis)
- **Code Execution**: Judge0 CE API
- **HTTP Client**: Axios

## 📁 Project Structure

```
dsa-worker/
├── src/
│   ├── config/             # Configuration
│   │   ├── redis.js       # Redis connection
│   │   ├── queue.js       # BullMQ queue setup
│   │   └── database.js    # MongoDB config
│   ├── models/            # Database models
│   │   ├── index.js       # Model exports
│   │   └── services/      # Business logic services
│   │       ├── judge0.service.js
│   │       └── codeWrapper.service.js
│   ├── server.js          # Express API server
│   └── worker.js          # Main worker process
├── Dockerfile             # Container configuration
└── package.json
```

## 🚀 Getting Started

### Prerequisites

- Node.js 18+
- Redis server (for job queue)
- MongoDB (for data persistence)
- Judge0 CE API access (RapidAPI)

### Installation

```bash
# Install dependencies
npm install

# Copy environment file
cp .env.example .env

# Start worker in development
npm run dev

# Start worker in production
npm start
```

Worker runs alongside API server:

- Worker Process: BullMQ consumer
- API Server: `http://localhost:3001`

## 🔐 Environment Variables

Create a `.env` file:

```bash
# Server
PORT=3001
NODE_ENV=development

# Database
MONGODB_URI=mongodb://localhost:27017/getplaced

# Redis (Job Queue & Cache)
REDIS_HOST=localhost
REDIS_PORT=6379

# Judge0 API
JUDGE0_API_URL=https://judge0-ce.p.rapidapi.com
JUDGE0_API_KEY=your_rapidapi_key
JUDGE0_API_HOST=judge0-ce.p.rapidapi.com

# Worker Configuration
WORKER_CONCURRENCY=5          # Number of parallel jobs
WORKER_MAX_RETRIES=3          # Max retry attempts
WORKER_RETRY_DELAY=5000       # Delay between retries (ms)
```

## ⚙️ How It Works

### Job Processing Flow

```
1. Job Added to Queue (by Backend)
   └─> Redis Queue (BullMQ)

2. Worker Picks Up Job
   ├─> Validate job data
   ├─> Load problem details
   └─> Wrap user code

3. Submit to Judge0
   ├─> Create batch submission
   ├─> Poll for results
   └─> Aggregate test results

4. Process Results
   ├─> Determine submission status
   ├─> Calculate metrics
   └─> Save to MongoDB

5. Cache Invalidation
   ├─> Clear user cache
   └─> Clear submission cache

6. Job Complete
   └─> Return result to queue
```

### Job Data Structure

```javascript
{
  jobId: "unique-job-id",
  problemId: "problem-id",
  problem: {
    _id: "problem-id",
    title: "Two Sum",
    timeLimit: 2000,
    memoryLimit: 256000,
    // ... other problem details
  },
  code: "user's solution code",
  language: "python", // or java, cpp, javascript, c
  testCases: [
    {
      input: "input data",
      expectedOutput: "expected output"
    }
  ],
  userId: "user-id"
}
```

## 🔧 Code Wrapper Service

Wraps user code to handle input/output and data structures.

### Supported Data Structures

- **Arrays**: `[1, 2, 3]`
- **Linked Lists**: `[1, 2, 3]` → `1 -> 2 -> 3`
- **Binary Trees**: `[1, 2, 3, null, 5]`
- **Graphs**: `[[1,2], [2,3]]`
- **Strings**: `"hello"`
- **Integers/Floats**: `42`, `3.14`

### Language Support

| Language | Judge0 ID | Extensions |
|----------|-----------|------------|
| Python | 71 | `.py` |
| Java | 62 | `.java` |
| C++ | 54 | `.cpp` |
| JavaScript | 63 | `.js` |
| C | 50 | `.c` |

### Wrapper Example (Python)

```python
# User's code
def twoSum(nums, target):
    # solution here
    pass

# Wrapper adds:
import json
import sys

# [User's code inserted here]

# Input parsing
test_input = json.loads(sys.stdin.read())
nums = test_input['nums']
target = test_input['target']

# Execute function
result = twoSum(nums, target)

# Output formatting
print(json.dumps(result))
```

## 🧪 Judge0 Integration

### Submission Process

```javascript
// 1. Create submissions
const submissions = await judge0Service.createBatchSubmissions(
  wrappedCode,
  language,
  testCases
)

// 2. Poll for results
const results = await judge0Service.pollSubmissions(submissions)

// 3. Process results
const processedResults = judge0Service.processResults(results)
```

### Status Codes

| Status | Description |
|--------|-------------|
| Accepted | All test cases passed |
| Wrong Answer | Test case failed |
| Time Limit Exceeded | Execution timeout |
| Compilation Error | Code compilation failed |
| Runtime Error | Code crashed during execution |
| Memory Limit Exceeded | Exceeded memory limit |

### Limits

- **Time Limit**: 2-10 seconds (per problem)
- **Memory Limit**: 256-512 MB (per problem)
- **Source Code**: Max 64 KB
- **Output**: Max 64 KB

## 📊 Worker Monitoring

### API Endpoints

```bash
# Health check
GET http://localhost:3001/health

# Worker status
GET http://localhost:3001/status
```

### Logs

Worker provides detailed logging:

```
🔵 STEP 0: Job received
   Job ID: 12345
   Problem: Two Sum
   Language: python
   User: user-id

🔵 STEP 1: Wrapping code...
🟢 STEP 1 COMPLETE: Code wrapped

🔵 STEP 2: Submitting to Judge0...
🟢 STEP 2 COMPLETE: Judge0 execution finished
   Passed: 3/3

🔵 STEP 4: Saving submission to DB...
💾 Submission saved: submission-id
🗑️ Cache invalidated

🟢 STEP 4 COMPLETE: Submission saved
✅ Job 12345 completed successfully
```

### Event Listeners

```javascript
// Job completed
worker.on('completed', (job, result) => {
  console.log(`✅ Job ${job.id} completed`)
})

// Job failed
worker.on('failed', (job, error) => {
  console.error(`❌ Job ${job.id} failed`)
})

// Worker error
worker.on('error', (error) => {
  console.error('❌ Worker error:', error)
})
```

## 🎯 What's Next?

### Performance Optimization

- [ ] Implement worker pools for horizontal scaling
- [ ] Add job prioritization (premium users first)
- [ ] Optimize Judge0 API usage (reduce polling)
- [ ] Implement result caching for identical submissions
- [ ] Add job batching for similar problems
- [ ] Reduce memory footprint with streaming

### Features

- [ ] Support more languages (Go, Rust, Ruby, Swift)
- [ ] Add custom test case generation
- [ ] Implement code plagiarism detection
- [ ] Add code quality metrics (complexity, style)
- [ ] Support interactive problems
- [ ] Add multi-file submissions
- [ ] Implement code profiling and analysis

### Reliability

- [ ] Add circuit breaker for Judge0 API
- [ ] Implement graceful degradation
- [ ] Add job timeout handling
- [ ] Implement dead letter queue
- [ ] Add automatic retry with exponential backoff
- [ ] Implement health check with auto-restart
- [ ] Add job progress tracking

### Monitoring & Logging

- [ ] Add structured logging (Winston/Pino)
- [ ] Implement metrics collection (Prometheus)
- [ ] Create custom dashboards (Grafana)
- [ ] Add error tracking (Sentry)
- [ ] Implement request tracing
- [ ] Add performance monitoring
- [ ] Create alerting system

### Developer Experience

- [ ] Add unit tests for wrappers
- [ ] Create integration tests
- [ ] Add code coverage reporting
- [ ] Implement local Judge0 setup (Docker)
- [ ] Create wrapper debugging tools
- [ ] Add wrapper validation scripts
- [ ] Document wrapper development

### Security

- [ ] Add code sandboxing
- [ ] Implement resource limits per user
- [ ] Add malicious code detection
- [ ] Implement rate limiting per user
- [ ] Add input validation and sanitization
- [ ] Secure sensitive data in logs
- [ ] Add worker authentication

## 🔄 Job Queue Configuration

### Concurrency

```javascript
const worker = new Worker('code-execution', processJob, {
  connection: redisConnection,
  concurrency: 5  // Process 5 jobs simultaneously
})
```

### Retry Strategy

```javascript
// In queue configuration
{
  attempts: 3,           // Retry failed jobs 3 times
  backoff: {
    type: 'exponential',
    delay: 5000          // Start with 5s delay
  }
}
```

### Job Removal

- **Completed jobs**: Kept for 1 hour
- **Failed jobs**: Kept for 24 hours
- **Active jobs**: No limit

## 🐛 Troubleshooting

### Worker Not Processing Jobs

```bash
# Check Redis connection
redis-cli ping

# Check BullMQ queue
redis-cli KEYS "bull:code-execution:*"

# Check worker logs
npm run dev
```

### Judge0 API Errors

```bash
# Verify API key
echo $JUDGE0_API_KEY

# Test Judge0 directly
curl -X GET https://judge0-ce.p.rapidapi.com/languages \
  -H "X-RapidAPI-Key: $JUDGE0_API_KEY"
```

### MongoDB Connection Issues

```bash
# Check MongoDB is running
mongosh

# Verify connection string
echo $MONGODB_URI
```

### High Memory Usage

- Reduce `WORKER_CONCURRENCY`
- Implement job size limits
- Add garbage collection tuning

## 📦 Docker Deployment

```dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .

CMD ["node", "src/worker.js"]
```

```bash
# Build image
docker build -t dsa-worker .

# Run container
docker run -d \
  --name dsa-worker \
  --env-file .env \
  -p 3001:3001 \
  dsa-worker
```

## 📈 Performance Metrics

Typical processing times:

- **Job pickup**: < 100ms
- **Code wrapping**: < 50ms
- **Judge0 submission**: 500ms - 3s (depends on code)
- **Result processing**: < 100ms
- **Database save**: < 200ms

**Total**: 1-4 seconds per job

## 📝 Best Practices

1. **Always validate job data** before processing
2. **Use try-catch** for all external calls
3. **Log all steps** for debugging
4. **Implement timeouts** for long-running operations
5. **Handle errors gracefully** with retries
6. **Monitor queue health** regularly
7. **Keep wrappers updated** for new language versions

## 📞 Support

For issues or questions:

- Check worker logs first
- Verify environment variables
- Test Judge0 API access
- Contact: <dhanjayarya@gmail.com>
