// Central export file for all study utilities

const { formatStudyDocument } = require('./documentFormatter');
const { generateQuizQuestions, getQuestionRecommendation } = require('./quizGenerator');
const { analyzeQuizResults } = require('./quizAnalyzer');
const { chatAboutQuestion, streamChatMessage } = require('./chatHandler');
const { generateVideoScript } = require('./videoScriptGenerator');

module.exports = {
    // Document formatting
    formatStudyDocument,
    
    // Quiz generation and recommendations
    generateQuizQuestions,
    getQuestionRecommendation,
    
    // Quiz analysis
    analyzeQuizResults,
    
    // Chat functionality
    chatAboutQuestion,
    streamChatMessage,
    
    // Video script generation
    generateVideoScript
};
