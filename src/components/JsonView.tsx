import React from 'react';

interface JsonViewProps {
  data: any;
  className?: string;
}

export const JsonView: React.FC<JsonViewProps> = ({ data, className = '' }) => {
  if (data === null || data === undefined) return null;

  const jsonString = typeof data === 'string' ? data : JSON.stringify(data, null, 2);

  const highlight = (json: string) => {
    // Regex to match JSON components: strings (including keys), numbers, booleans, nulls
    // Use non-capturing groups (?:...) to avoid shifting arguments in the replace callback
    const regex = /"(?:\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(?:\s*:)?|\b(?:true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+-]?\d+)?/g;
    
    const result: React.ReactNode[] = [];
    let lastIndex = 0;
    
    // The arguments are: match, offset, string (since there are no capturing groups now)
    json.replace(regex, (match, offset: number) => {
      // Add the text before the match (white space, brackets, commas)
      const before = json.slice(lastIndex, offset);
      if (before) result.push(before);
      
      let cls = '';
      if (/^"/.test(match)) {
        if (/:$/.test(match)) {
          cls = 'json-key';
        } else {
          cls = 'json-string';
        }
      } else if (/true|false/.test(match)) {
        cls = 'json-boolean';
      } else if (/null/.test(match)) {
        cls = 'json-null';
      } else {
        cls = 'json-number';
      }
      
      result.push(<span key={offset} className={`json-token ${cls}`}>{match}</span>);
      lastIndex = offset + match.length;
      return match;
    });
    
    result.push(json.slice(lastIndex));
    return result;
  };

  return (
    <pre className={`whitespace-pre-wrap break-all font-mono text-[11px] leading-relaxed text-neutral-600 dark:text-neutral-400 ${className}`}>
      {highlight(jsonString)}
    </pre>
  );
};
