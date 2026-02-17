const { sendPollinationsMessages, streamPollinationsMessage } = require('../pollinations');
const { PROMPTS } = require('./promptLoader');

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
 * Stream chat messages using SSE with Pollinations AI
 * @param {string} context - The context for the chat
 * @param {string} userMessage - The user's message
 * @param {string} studyContent - The study content for context
 * @param {Array} chatHistory - Previous chat history
 * @param {Object} res - Express response object for streaming
 * @returns {Promise<string>} - The complete response text
 */
async function streamChatMessage(context, userMessage, studyContent, chatHistory = [], res) {
    const systemContent = PROMPTS.streamChatMessage.system
        .replace('${context}', context)
        .replace('${studyContent}', studyContent);
    
    // Build full prompt with history
    let fullPrompt = systemContent + '\n\n';
    
    // Add chat history (last 10 messages to avoid token limits)
    const recentHistory = chatHistory.slice(-10);
    for (const msg of recentHistory) {
        if (msg.role === 'user') {
            fullPrompt += `User: ${msg.content}\n\n`;
        } else if (msg.role === 'assistant') {
            fullPrompt += `Assistant: ${msg.content}\n\n`;
        }
    }
    
    // Add current user message
    fullPrompt += `User: ${userMessage}\n\nAssistant:`;
    
    return await streamPollinationsMessage(fullPrompt, res);
}

module.exports = {
    chatAboutQuestion,
    streamChatMessage
};
