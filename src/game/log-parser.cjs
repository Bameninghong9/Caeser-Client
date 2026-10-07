function formatTimestamp(ts) {
  const d = ts ? new Date(Number(ts)) : new Date();
  if (Number.isNaN(d.getTime())) {
    const now = new Date();
    const pad = n => String(n).padStart(2, '0');
    return `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
  }
  const pad = n => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function parseLog4jXmlBlock(xml) {
  const loggerMatch = xml.match(/logger="([^"]*)"/);
  const levelMatch = xml.match(/level="([^"]*)"/);
  const timeMatch = xml.match(/timestamp="([^"]*)"/);

  const logger = loggerMatch ? loggerMatch[1] : '';
  const level = (levelMatch ? levelMatch[1] : 'INFO').toUpperCase();
  const timeStr = formatTimestamp(timeMatch ? timeMatch[1] : null);

  let message = '';
  const msgMatch = xml.match(/<log4j:Message>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/log4j:Message>/);
  if (msgMatch) {
    message = msgMatch[1];
  } else {
    const cdataMatch = xml.match(/<!\[CDATA\[([\s\S]*?)\]\]>/);
    if (cdataMatch) message = cdataMatch[1];
  }

  let throwable = '';
  const throwMatch = xml.match(/<log4j:Throwable>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/log4j:Throwable>/);
  if (throwMatch) {
    throwable = throwMatch[1];
  }

  const prefix = `[${timeStr}] [${level}]${logger ? ' [' + logger + ']' : ''}: `;
  const results = [];
  const lines = message.split(/\r?\n/);
  if (lines.length > 0 && lines[0].length > 0) {
    results.push(prefix + lines[0]);
    for (let i = 1; i < lines.length; i++) {
      results.push(lines[i]);
    }
  } else if (prefix) {
    results.push(prefix.trimEnd());
  }

  if (throwable) {
    for (const line of throwable.split(/\r?\n/)) {
      if (line.trim()) results.push(line);
    }
  }

  return results;
}

function createLogParser(onLine) {
  let inXml = false;
  let xmlBuffer = '';

  function feed(rawLine) {
    const line = String(rawLine ?? '');
    const trimmed = line.trim();

    if (!inXml && trimmed.startsWith('<log4j:Event')) {
      inXml = true;
      xmlBuffer = line;
      if (trimmed.includes('</log4j:Event>')) {
        inXml = false;
        const parsed = parseLog4jXmlBlock(xmlBuffer);
        for (const out of parsed) onLine(out);
        xmlBuffer = '';
      }
      return;
    }

    if (inXml) {
      xmlBuffer += '\n' + line;
      if (trimmed.includes('</log4j:Event>')) {
        inXml = false;
        const parsed = parseLog4jXmlBlock(xmlBuffer);
        for (const out of parsed) onLine(out);
        xmlBuffer = '';
      }
      return;
    }

    // Skip lone leftover tags
    if (trimmed.startsWith('</log4j:') || (trimmed.startsWith('<log4j:') && trimmed.endsWith('/>'))) {
      return;
    }

    onLine(line);
  }

  function flush() {
    if (inXml && xmlBuffer) {
      const parsed = parseLog4jXmlBlock(xmlBuffer);
      for (const out of parsed) onLine(out);
      xmlBuffer = '';
      inXml = false;
    }
  }

  return { feed, flush, parseLog4jXmlBlock, formatTimestamp };
}

module.exports = { createLogParser, parseLog4jXmlBlock, formatTimestamp };
