const { sendPollinationsMessages } = require('../pollinations');
const { PROMPTS } = require('./promptLoader');

/**
 * Analyze quiz results and provide personalized feedback
 * @param {Array} results - Array of quiz results with question, userAnswer, correctAnswer, isCorrect
 * @param {string} studyContent - The study content for context
 * @param {Array} topics - Topics for context
 * @returns {Promise<string>} - Markdown formatted analysis
 */
async function analyzeQuizResults(results, studyContent, topics = []) {
    const correct = results.filter(r => r.isCorrect).length;
    const total = results.length;
    const percentage = Math.round((correct / total) * 100);
    
    const wrongQuestions = results.filter(r => !r.isCorrect);
    const correctQuestions = results.filter(r => r.isCorrect);
    
    const correctAnswersText = correctQuestions.map(q => 
        `- Question: "${q.question}"\n  Answer: "${q.correctAnswer}"`
    ).join('\n\n');
    
    const incorrectAnswersText = wrongQuestions.map(q => 
        `- Question: "${q.question}"\n  User answered: "${q.userAnswer}"\n  Correct answer: "${q.correctAnswer}"`
    ).join('\n\n');
    
    const userContent = PROMPTS.analyzeQuizResults.user
        .replace('${correct}', correct)
        .replace('${total}', total)
        .replace('${percentage}', percentage)
        .replace('${correctQuestions.map(q => `- Question: "${q.question}"\n  Answer: "${q.correctAnswer}"`).join(\'\n\n\')}', correctAnswersText)
        .replace('${wrongQuestions.map(q => `- Question: "${q.question}"\n  User answered: "${q.userAnswer}"\n  Correct answer: "${q.correctAnswer}"`).join(\'\n\n\')}', incorrectAnswersText)
        .replace('${studyContent.substring(0, 5000)}', studyContent.substring(0, 5000));
    
    const messages = [
        {
            role: 'system',
            content: PROMPTS.analyzeQuizResults.system
        },
        {
            role: 'user',
            content: userContent
        }
    ];

    return await sendPollinationsMessages(messages);
}

module.exports = { analyzeQuizResults };
