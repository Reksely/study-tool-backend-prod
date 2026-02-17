const { sendPollinationsMessages } = require('../pollinations');
const { PROMPTS } = require('./promptLoader');

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

module.exports = { generateVideoScript };
