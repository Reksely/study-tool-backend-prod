const fs = require('fs');
const path = require('path');

// Load prompts from text files
const promptsDir = path.join(__dirname, '..', '..', 'prompts');

function loadPrompt(filename) {
    const filePath = path.join(promptsDir, filename);
    return fs.readFileSync(filePath, 'utf8');
}

// Cache prompts at module load time
const PROMPTS = {
    formatStudyDocument: {
        system: loadPrompt('format-study-document-system.txt'),
        user: loadPrompt('format-study-document-user.txt')
    },
    generateQuizQuestions: {
        system: loadPrompt('generate-quiz-questions-system.txt'),
        user: loadPrompt('generate-quiz-questions-user.txt')
    },
    chatAboutQuestion: {
        system: loadPrompt('chat-about-question-system.txt')
    },
    analyzeQuizResults: {
        system: loadPrompt('analyze-quiz-results-system.txt'),
        user: loadPrompt('analyze-quiz-results-user.txt')
    },
    generateVideoScript: {
        system: loadPrompt('generate-video-script-system.txt'),
        user: loadPrompt('generate-video-script-user.txt')
    },
    streamChatMessage: {
        system: loadPrompt('stream-chat-message-system.txt')
    }
};

module.exports = { PROMPTS };
