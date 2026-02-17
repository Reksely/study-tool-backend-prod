const { sendPollinationsMessages } = require('../pollinations');
const { PROMPTS } = require('./promptLoader');

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
    
    return parseTopicsFromMarkdown(response, title);
}

/**
 * Parse markdown response into topics
 * @param {string} response - Markdown response from AI
 * @param {string} defaultTitle - Default title if no topics found
 * @returns {Object} - { topics: Array, fullContent: string }
 */
function parseTopicsFromMarkdown(response, defaultTitle) {
    // Look for "# Unit X:" headers to split into topics
    const topicRegex = /^#\s+(Unit\s+\d+[:\s]+[^\n]+)/gmi;
    let matches = [...response.matchAll(topicRegex)];
    
    // Fallback: if no "# Unit" headers found, try any # header
    if (matches.length < 2) {
        const fallbackRegex = /^#\s+([^\n]+)/gm;
        matches = [...response.matchAll(fallbackRegex)];
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
            
            topics.push({
                id: `topic-${i + 1}`,
                title: title,
                icon: icon,
                content: topicContent.replace(/^#\s+[^\n]+\n*/, '').trim(),
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
            title: defaultTitle,
            icon: '📚',
            content: response,
            order: 0
        }],
        fullContent: response
    };
}

module.exports = { formatStudyDocument };
