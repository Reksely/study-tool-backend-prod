/* 
Pollinations AI used to be free at time of writing this code. Now it is not.

Reference https://enter.pollinations.ai/ and https://enter.pollinations.ai/api/docs to update 
with your own API key.
*/


const axios = require('axios');
const fs = require('fs');
const path = require('path');

// Load prompts from text files
const promptsDir = path.join(__dirname, '..', 'prompts');

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

/**
 * Send messages to Pollinations AI API
 * @param {Array} messages - Array of message objects with role and content
 * @param {number} retryCount - Number of retries on failure
 * @returns {Promise<string>} - The AI response text
 */
async function sendPollinationsMessages(messages, retryCount = 3) {
    const apiEndpoint = 'https://text.pollinations.ai/openai';
    
    let attempts = 0;
    
    while (attempts < retryCount) {
        try {
            attempts++;
            console.log(`Generating text with Pollinations AI, attempt ${attempts}/${retryCount}...`);
            
            const response = await axios.post(
                apiEndpoint,
                {
                    messages: messages,
                    model: 'openai',
                    stream: false
                },
                {
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    timeout: 300000 // 5 minutes
                }
            );
            
            console.log('Text generation completed successfully!');
            
            // Handle OpenAI-compatible response format
            if (response.data && response.data.choices && response.data.choices.length > 0) {
                let content = response.data.choices[0].message?.content;
                if (content) {
                    // Clean up any special tokens
                    content = content
                        .replace(/<\|.*?\|>[a-zA-Z0-9_]*?(?=<\||$)/g, '')
                        .replace(/<\|.*?\|>/g, '')
                        .trim();
                    return content;
                }
            }
            
            throw new Error(`No content found in response. Response structure: ${JSON.stringify(response.data)}`);
            
        } catch (error) {
            console.error(`Attempt ${attempts}/${retryCount} failed:`, error.message);
            if (error.response) {
                console.error("Response status:", error.response.status);
                console.error("Response data:", JSON.stringify(error.response.data, null, 2));
            }
            
            if (attempts === retryCount) {
                throw new Error(`Failed to generate text after ${retryCount} attempts: ${error.message}`);
            }
            
            // Wait before retry
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
    }
}

/**
 * Format raw content into topics with beautiful formatting
 * @param {string} rawContent - Raw text from PDFs or notes
 * @param {string} title - Study title
 * @param {string} studyFor - What the user is studying for
 * @param {Array} pdfFileNames - Names of uploaded PDFs for context
 * @returns {Promise<Object>} - { topics: Array, fullContent: string }
 */
async function formatStudyDocument(rawContent, title, studyFor = '', pdfFileNames = []) {
    const studyContext = studyFor ? `The student is studying for: ${studyFor}` : '';
    const fileContext = pdfFileNames.length > 0 
        ? `Source files: ${pdfFileNames.join(', ')}. Each PDF should become its own unit/topic.`
        : '';
    
    const userContent = PROMPTS.formatStudyDocument.user
        .replace('${studyContext}', studyContext)
        .replace('${fileContext}', fileContext)
        .replace('${title}', title)
        .replace('${rawContent}', rawContent);
    
    const messages = [
        {
            role: 'system',
            content: PROMPTS.formatStudyDocument.system
        },
        {
            role: 'user',
            content: userContent
        }
    ];

    let response = await sendPollinationsMessages(messages);
    
    // Clean up any "should I continue" type messages that slip through
    response = response
        .replace(/please let me (know|continue|proceed).*$/gi, '')
        .replace(/should I (continue|proceed|go on).*$/gi, '')
        .replace(/let me know if you (want|need|would like).*$/gi, '')
        .replace(/I can continue.*$/gi, '')
        .replace(/want me to (continue|proceed|go on).*$/gi, '')
        .trim();
    
    // Parse markdown response into topics
    // Look for "# Unit X:" headers to split into topics
    const topicRegex = /^#\s+(Unit\s+\d+[:\s]+[^\n]+)/gmi;
    let matches = [...response.matchAll(topicRegex)];
    let isUnitFormat = matches.length >= 2;
    
    // Fallback: if no "# Unit" headers found, try any # header
    if (matches.length < 2) {
        const fallbackRegex = /^#\s+([^\n]+)/gm;
        matches = [...response.matchAll(fallbackRegex)];
        isUnitFormat = false;
    }
    
    if (matches.length >= 2) {
        // Multiple topics found - split content
        const topics = [];
        
        for (let i = 0; i < matches.length; i++) {
            const match = matches[i];
            const nextMatch = matches[i + 1];
            
            const startIndex = match.index;
            const endIndex = nextMatch ? nextMatch.index : response.length;
            
            const topicContent = response.substring(startIndex, endIndex).trim();
            let titleLine = match[1].trim();
            
            // Extract emoji from title if present
            const emojiMatch = titleLine.match(/^([\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|📚|💡|⚠️|✅|🔑|📝|🎯|📊|📌|👥)\s*/u);
            const icon = emojiMatch ? emojiMatch[1] : '📚';
            let title = emojiMatch ? titleLine.substring(emojiMatch[0].length).trim() : titleLine;
            
            // Keep "Unit X:" prefix in the title for clarity
            // titleLine already includes "Unit X:" from the regex capture group
            
            topics.push({
                id: `topic-${i + 1}`,
                title: title,
                icon: icon,
                content: topicContent.replace(/^#\s+[^\n]+\n*/, '').trim(), // Remove the # header from content
                order: i
            });
        }
        
        return {
            topics,
            fullContent: response
        };
    }
    
    // Single topic or no clear topic divisions - return as single topic
    return {
        topics: [{
            id: 'topic-1',
            title: title,
            icon: '📚',
            content: response,
            order: 0
        }],
        fullContent: response
    };
}

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
    let previousResultsContext = '';
    if (previousResults && previousResults.wrongQuestions && previousResults.wrongQuestions.length > 0) {
        previousResultsContext = `
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
    
    // Build known concepts context if available
    let knownConceptsContext = '';
    if (knownConcepts && knownConcepts.length > 0) {
        // Limit to most recent 50 to avoid token limits
        const recentKnown = knownConcepts.slice(0, 50);
        knownConceptsContext = `
IMPORTANT - AVOID THESE MASTERED CONCEPTS:
The student has already demonstrated knowledge of these ${recentKnown.length} concepts/questions. Do NOT ask questions about these same concepts:

${recentKnown.map((q, i) => `${i + 1}. "${q}"`).join('\n')}

Generate questions about DIFFERENT concepts from the material that the student hasn't been tested on yet.
Focus on NEW topics and concepts they haven't mastered.`;
    }
    
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
    
    // Clean up the response before parsing
    let cleanedResponse = response
        .trim()
        // Remove any markdown code blocks
        .replace(/^```json?\s*/i, '')
        .replace(/\s*```$/i, '')
        // Remove any leading/trailing text before/after the JSON array
        .replace(/^[^[]*(\[)/s, '$1')
        .replace(/(\])[^\]]*$/s, '$1')
        // Fix common JSON issues
        .replace(/,\s*]/g, ']') // Remove trailing commas
        .replace(/,\s*}/g, '}') // Remove trailing commas in objects
        .trim();
    
    try {
        // Try to parse the cleaned JSON response
        const parsed = JSON.parse(cleanedResponse);
        return Array.isArray(parsed) ? parsed : parsed.questions || [];
    } catch (e) {
        console.error('First parse attempt failed:', e.message);
        
        // Try to extract JSON from the response more aggressively
        const jsonMatch = response.match(/\[\s*\{[\s\S]*\}\s*\]/);
        if (jsonMatch) {
            try {
                // Try to fix common issues in the extracted JSON
                let fixedJson = jsonMatch[0]
                    .replace(/,\s*]/g, ']')
                    .replace(/,\s*}/g, '}')
                    // Fix unescaped quotes in strings (common AI mistake)
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
 * Chat with AI about a specific question
 * @param {string} context - Context about what the user is doing (document/quiz tab info)
 * @param {string} userMessage - User's message/question
 * @param {string} studyContent - Related study content for context
 * @param {Array} chatHistory - Previous messages in the conversation
 * @returns {Promise<string>} - AI response
 */
async function chatAboutQuestion(context, userMessage, studyContent, chatHistory = []) {
    const systemContent = PROMPTS.chatAboutQuestion.system
        .replace('${context}', context)
        .replace('${studyContent}', studyContent);
    
    const messages = [
        {
            role: 'system',
            content: systemContent
        }
    ];

    // Add chat history (last 10 messages to avoid token limits)
    const recentHistory = chatHistory.slice(-10);
    for (const msg of recentHistory) {
        messages.push({
            role: msg.role,
            content: msg.content
        });
    }

    // Add current user message
    messages.push({
        role: 'user',
        content: userMessage
    });

    return await sendPollinationsMessages(messages);
}

/**
 * Get recommended number of questions based on content length and topic count
 * @param {string} content - Study content
 * @param {number} topicCount - Number of topics in the study
 * @returns {Object} - Recommendation with min, max, and suggested values
 */
function getQuestionRecommendation(content, topicCount = 1) {
    // 10 questions per topic is the target
    const questionsPerTopic = 10;
    
    // Calculate based on topic count (10 questions per topic)
    const suggested = topicCount * questionsPerTopic;
    const min = Math.max(5, topicCount * 5); // At least 5 questions per topic minimum
    const max = topicCount * 15; // Up to 15 questions per topic maximum
    
    const label = topicCount > 1 
        ? `${topicCount} topics × 10 questions` 
        : '1 topic';
    
    return { min, max, suggested, label };
}

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
    
    const correctAnswersText = correctQuestions.map(q => `- Question: "${q.question}"\n  Answer: "${q.correctAnswer}"`).join('\n\n');
    const incorrectAnswersText = wrongQuestions.map(q => `- Question: "${q.question}"\n  User answered: "${q.userAnswer}"\n  Correct answer: "${q.correctAnswer}"`).join('\n\n');
    
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

/**
 * Generate a TikTok-style video script from topic content
 * @param {string} topicTitle - Title of the topic
 * @param {string} topicContent - Content of the topic
 * @returns {Promise<string>} - Video script
 */
async function generateVideoScript(topicTitle, topicContent) {
    const userContent = PROMPTS.generateVideoScript.user
        .replace('${topicTitle}', topicTitle)
        .replace('${topicContent.substring(0, 3000)}', topicContent.substring(0, 3000));
    
    const messages = [
        {
            role: 'system',
            content: PROMPTS.generateVideoScript.system
        },
        {
            role: 'user',
            content: userContent
        }
    ];

    const script = await sendPollinationsMessages(messages);
    
    // Clean up the script
    return script
        .replace(/^(Script:|Here's the script:|TikTok Script:)/gi, '')
        .trim();
}

/**
 * Stream chat messages using SSE with Pollinations AI
 * @param {string} context - The context for the chat
 * @param {string} userMessage - The user's message
 * @param {string} studyContent - The study content for context
 * @param {Array} chatHistory - Previous chat history
 * @param {Object} res - Express response object for streaming
 * @returns {Promise<string>} - The complete response text
 */
async function streamChatMessage(context, userMessage, studyContent, chatHistory = [], res) {
    const apiEndpoint = 'https://text.pollinations.ai/openai';
    
    const systemContent = PROMPTS.streamChatMessage.system
        .replace('${context}', context)
        .replace('${studyContent}', studyContent);
    
    const messages = [
        {
            role: 'system',
            content: systemContent
        }
    ];

    // Add chat history (last 10 messages to avoid token limits)
    const recentHistory = chatHistory.slice(-10);
    for (const msg of recentHistory) {
        messages.push({
            role: msg.role,
            content: msg.content
        });
    }

    // Add current user message
    messages.push({
        role: 'user',
        content: userMessage
    });
    
    try {
        const response = await axios.post(
            apiEndpoint,
            {
                messages: messages,
                model: 'openai',
                stream: true
            },
            {
                headers: {
                    'Content-Type': 'application/json'
                },
                timeout: 300000,
                responseType: 'stream'
            }
        );

        let fullContent = '';
        
        return new Promise((resolve, reject) => {
            response.data.on('data', (chunk) => {
                const lines = chunk.toString().split('\n').filter(line => line.trim() !== '');
                
                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        const data = line.slice(6);
                        if (data === '[DONE]') {
                            continue;
                        }
                        
                        try {
                            const parsed = JSON.parse(data);
                            const content = parsed.choices?.[0]?.delta?.content;
                            if (content) {
                                fullContent += content;
                                // Send the chunk to the client
                                res.write(`data: ${JSON.stringify({ content })}\n\n`);
                            }
                        } catch (e) {
                            // Ignore parse errors for incomplete chunks
                        }
                    }
                }
            });

            response.data.on('end', () => {
                res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
                res.end();
                resolve(fullContent);
            });

            response.data.on('error', (err) => {
                console.error('Stream error:', err);
                res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
                res.end();
                reject(err);
            });
        });
    } catch (error) {
        console.error('Stream request error:', error);
        throw error;
    }
}

module.exports = {
    sendPollinationsMessages,
    formatStudyDocument,
    generateQuizQuestions,
    chatAboutQuestion,
    streamChatMessage,
    getQuestionRecommendation,
    analyzeQuizResults,
    generateVideoScript
};
