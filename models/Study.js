const mongoose = require('mongoose');

const QuizQuestionSchema = new mongoose.Schema({
  question: String,
  options: [String],
  correctAnswer: Number,
  explanation: String,
  hint: String,
  topicId: String, // Which topic this question belongs to
});

const QuizAnswerSchema = new mongoose.Schema({
  question: String,
  options: [String],
  correctAnswer: Number,
  userAnswer: Number, // Index of user's selected answer
  isCorrect: Boolean,
  topicId: String,
});

const QuizHistorySchema = new mongoose.Schema({
  id: {
    type: String,
    required: true,
  },
  takenAt: {
    type: Date,
    default: Date.now,
  },
  totalQuestions: Number,
  correctCount: Number,
  wrongCount: Number,
  percentage: Number,
  selectedTopics: [String], // Topic IDs that were selected for this quiz
  answers: [QuizAnswerSchema],
});

const ChatMessageSchema = new mongoose.Schema({
  role: {
    type: String,
    enum: ['user', 'assistant'],
    required: true,
  },
  content: {
    type: String,
    required: true,
  },
  timestamp: {
    type: Date,
    default: Date.now,
  },
});

const TopicSchema = new mongoose.Schema({
  id: {
    type: String,
    required: true,
  },
  title: {
    type: String,
    required: true,
  },
  icon: {
    type: String,
    default: '📚',
  },
  content: {
    type: String,
    required: true,
  },
  order: {
    type: Number,
    default: 0,
  },
  learned: {
    type: Boolean,
    default: false, // Default to not learned
  },
  videoUrl: {
    type: String,
    default: null, // TikTok video URL for this topic
  },
  videoGenerating: {
    type: Boolean,
    default: false,
  },
});

const StudySchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: [true, 'Title is required'],
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    content: {
      type: String,
      required: [true, 'Content is required'],
    },
    rawContent: {
      type: String, // Original unformatted content
    },
    sourceType: {
      type: String,
      enum: ['notes', 'document'],
      required: true,
    },
    uploadedFileNames: {
      type: [String],
      default: [],
    },
    // Topics - divided content sections
    topics: {
      type: [TopicSchema],
      default: [],
    },
    quizQuestions: {
      type: [QuizQuestionSchema],
      default: [],
    },
    // Separate chat histories for document and quiz tabs
    documentChatHistory: {
      type: [ChatMessageSchema],
      default: [],
    },
    quizChatHistory: {
      type: [ChatMessageSchema],
      default: [],
    },
    // Quiz history - stores all completed quizzes
    quizHistory: {
      type: [QuizHistorySchema],
      default: [],
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('Study', StudySchema);
