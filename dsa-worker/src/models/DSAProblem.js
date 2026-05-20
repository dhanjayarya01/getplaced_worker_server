import mongoose from 'mongoose'

const testCaseSchema = {
    input: { type: String, required: true },
    expectedOutput: { type: String, required: true },
    isHidden: { type: Boolean, default: false },
}

const languageRunnerSchema = {
    template: { type: String, required: true },
}

const dsaProblemSchema = new mongoose.Schema(
    {
        title: { type: String, required: true, unique: true },
        problemNumber: { type: Number, required: true, unique: true },
        slug: { type: String, required: true, unique: true, lowercase: true },
        description: { type: String, required: true },
        difficulty: {
            type: String,
            enum: ['Easy', 'Medium', 'Hard'],
            required: true,
        },

        dataStructures: [{ type: String }],
        patterns: [{ type: String }],

        constraints: [String],
        examples: [
            {
                input: String,
                output: String,
                explanation: String,
            },
        ],

        starterCode: {
            javascript: String,
            python: String,
            java: String,
            cpp: String,
            c: String,
        },

        runners: {
            javascript: languageRunnerSchema,
            python: languageRunnerSchema,
            java: languageRunnerSchema,
            cpp: languageRunnerSchema,
            c: languageRunnerSchema,
        },

        testCases: [testCaseSchema],

        timeLimit: { type: Number, default: 5 },
        memoryLimit: { type: Number, default: 256000 },

        acceptance: { type: Number, min: 0, max: 100 },
        totalSubmissions: { type: Number, default: 0 },
        totalAccepted: { type: Number, default: 0 },

        relatedProblems: [
            { type: mongoose.Schema.Types.ObjectId, ref: 'DSAProblem' },
        ],
        companies: [
            { type: mongoose.Schema.Types.ObjectId, ref: 'Company' },
        ],

        isActive: { type: Boolean, default: true },
        isPremium: { type: Boolean, default: false },
    },
    { timestamps: true }
)

dsaProblemSchema.pre('save', function (next) {
    if (this.isModified('slug') && this.slug) {
        this.slug = this.slug.replace(/-/g, '').trim().toLowerCase()
    }
    next()
})

dsaProblemSchema.pre('findOneAndUpdate', function (next) {
    const update = this.getUpdate()
    if (update?.slug) {
        update.slug = update.slug.replace(/-/g, '').trim().toLowerCase()
    }
    next()
})

dsaProblemSchema.index({ slug: 1 })
dsaProblemSchema.index({ difficulty: 1 })
dsaProblemSchema.index({ isActive: 1 })

const DSAProblem = mongoose.model('DSAProblem', dsaProblemSchema)

export default DSAProblem
