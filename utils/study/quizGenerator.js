const { sendPollinationsMessages } = require('../pollinations');
const { PROMPTS } = require('./promptLoader');

/**
 * Generate quiz questions from study content
 * @param {string} content - Study content
 * @param {number} numQuestions - Number of questions to generate
 * @param {Array} selectedTopics - Optional array of topic IDs to focus on
 * @param {Array} allTopics - All topics for context
 * @param {Object} previousResults - Previous quiz results for "focus on mistakes" mode
 * @param {Array} knownConcepts - Questions the user has already mastered (to avoid)
 * @returns {Promise<Array>} - Array of quiz questions
 */
async function generateQuizQuestions(content, numQuestions = 10, selectedTopics = [], allTopics = [], previousResults = null, knownConcepts = null) {
    // If specific topics selected, filter content
    let quizContent = content;
    let topicContext = '';
    
    if (selectedTopics.length > 0 && allTopics.length > 0) {
        const filteredTopics = allTopics.filter(t => selectedTopics.includes(t.id));
        if (filteredTopics.length > 0) {
            quizContent = filteredTopics.map(t => `## ${t.title}\n${t.content}`).join('\n\n');
            topicContext = `Focus questions on these topics: ${filteredTopics.map(t => t.title).join(', ')}`;
        }
    }
    
    // Build previous results context if available
    let previousResultsContext = buildPreviousResultsContext(previousResults);
    
    // Build known concepts context if available
    let knownConceptsContext = buildKnownConceptsContext(knownConcepts);
    
    const userContent = PROMPTS.generateQuizQuestions.user
        .replace('${numQuestions}', numQuestions)
        .replace('${topicContext}', topicContext)
        .replace('${previousResultsContext}', previousResultsContext)
        .replace('${knownConceptsContext}', knownConceptsContext)
        .replace('${quizContent.substring(0, 30000)}', quizContent.substring(0, 30000));
    
    const messages = [
        {
            role: 'system',
            content: PROMPTS.generateQuizQuestions.system
        },
        {
            role: 'user',
            content: userContent
        }
    ];

    const response = await sendPollinationsMessages(messages);
    
    return parseQuizQuestionsFromResponse(response);
}

/**
 * Build context for previous quiz results
 */
function buildPreviousResultsContext(previousResults) {
    if (!previousResults || !previousResults.wrongQuestions || previousResults.wrongQuestions.length === 0) {
        return '';
    }
    
    return `
IMPORTANT - FOCUS ON WEAK AREAS:
The student just completed a quiz and got ${previousResults.correct} correct and ${previousResults.wrong} wrong out of ${previousResults.total} questions.

Here are the questions they got WRONG - generate NEW questions that test the SAME concepts but with different wording:
${previousResults.wrongQuestions.map((q, i) => `
${i + 1}. Question: "${q.question}"
   They answered: "${q.userAnswer}"
   Correct answer was: "${q.correctAnswer}"
`).join('')}

Create questions that:
- Test the same underlying concepts they struggled with
- Use different examples and scenarios
- Help reinforce the correct understanding
- Do NOT repeat the exact same questions`;
}

/**
 * Build context for known concepts to avoid
 */
function buildKnownConceptsContext(knownConcepts) {
    if (!knownConcepts || knownConcepts.length === 0) {
        return '';
    }
    
    // Limit to most recent 50 to avoid token limits
    const recentKnown = knownConcepts.slice(0, 50);
    return `
IMPORTANT - AVOID THESE MASTERED CONCEPTS:
The student has already demonstrated knowledge of these ${recentKnown.length} concepts/questions. Do NOT ask questions about these same concepts:

${recentKnown.map((q, i) => `${i + 1}. "${q}"`).join('\n')}

Generate questions about DIFFERENT concepts from the material that the student hasn't been tested on yet.
Focus on NEW topics and concepts they haven't mastered.`;
}

/**
 * Parse quiz questions from AI response
 */
function parseQuizQuestionsFromResponse(response) {
    // Clean up the response before parsing
    let cleanedResponse = response
        .trim()
        .replace(/^```json?\s*/i, '')
        .replace(/\s*```$/i, '')
        .replace(/^[^[]*(\[)/s, '$1')
        .replace(/(\])[^\]]*$/s, '$1')
        .replace(/,\s*]/g, ']')
        .replace(/,\s*}/g, '}')
        .trim();
    
    try {
        const parsed = JSON.parse(cleanedResponse);
        return Array.isArray(parsed) ? parsed : parsed.questions || [];
    } catch (e) {
        console.error('First parse attempt failed:', e.message);
        
        // Try to extract JSON from the response more aggressively
        const jsonMatch = response.match(/\[\s*\{[\s\S]*\}\s*\]/);
        if (jsonMatch) {
            try {
                let fixedJson = jsonMatch[0]
                    .replace(/,\s*]/g, ']')
                    .replace(/,\s*}/g, '}')
                    .replace(/:\s*"([^"]*?)(?<!\\)"([^"]*?)"/g, ': "$1\\"$2"');
                
                return JSON.parse(fixedJson);
            } catch (e2) {
                console.error('Failed to parse extracted JSON:', e2.message);
                console.error('Extracted JSON:', jsonMatch[0].substring(0, 500));
            }
        }
        
        console.error('Failed to parse quiz questions:', e);
        console.error('Response preview:', response.substring(0, 500));
        return [];
    }
}

/**
 * Get recommended number of questions based on content length and topic count
 * @param {string} content - Study content
 * @param {number} topicCount - Number of topics in the study
 * @returns {Object} - Recommendation with min, max, and suggested values
 */
function getQuestionRecommendation(content, topicCount = 1) {
    const questionsPerTopic = 10;
    
    const suggested = topicCount * questionsPerTopic;
    const min = Math.max(5, topicCount * 5);
    const max = topicCount * 15;
    
    const label = topicCount > 1 
        ? `${topicCount} topics × 10 questions` 
        : '1 topic';
    
    return { min, max, suggested, label };
}

module.exports = {
    generateQuizQuestions,
    getQuestionRecommendation
};
