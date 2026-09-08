import type { ReactNode } from 'react'

type Token = { text: string; color?: string }

const COLOR = {
  comment: '#8b949e',
  string: '#a5d6ff',
  number: '#f54e00',
  keyword: '#f54e00',
  type: '#7ee787',
  tag: '#7ee787',
  attr: '#d2a8ff',
  punct: '#6e7681',
}

const KEYWORDS =
  /^(import|export|from|default|const|let|var|function|return|if|else|for|while|switch|case|break|continue|new|class|extends|async|await|try|catch|finally|throw|typeof|instanceof|in|of|this|super|null|undefined|true|false|interface|type|enum|implements|public|private|readonly|static|as|void|never|def|elif|lambda|None|True|False|self|print)$/

const TYPES = /^(string|number|boolean|any|unknown|object|Array|Promise|Record|React|useState|useEffect|useRef|useMemo)$/

function web(source: string): Token[] {
  const tokens: Token[] = []
  const pattern =
    /(<!--[\s\S]*?-->)|(<\/?[A-Za-z][\w:-]*)|("[^"]*"|'[^']*')|([A-Za-z-]+)(?==)|(\/?>)|(#[0-9a-fA-F]{3,8})|(\b\d+(?:\.\d+)?(?:px|rem|em|%|vh|vw|s|ms)?\b)/g
  let last = 0
  let match = pattern.exec(source)
  while (match) {
    if (match.index > last) tokens.push({ text: source.slice(last, match.index) })
    const [text] = match
    const color = match[1]
      ? COLOR.comment
      : match[2]
        ? COLOR.tag
        : match[3]
          ? COLOR.string
          : match[4]
            ? COLOR.attr
            : match[5]
              ? COLOR.tag
              : COLOR.number
    tokens.push({ text, color })
    last = match.index + text.length
    match = pattern.exec(source)
  }
  if (last < source.length) tokens.push({ text: source.slice(last) })
  return tokens
}

function css(source: string): Token[] {
  const tokens: Token[] = []
  const pattern = /(\/\*[\s\S]*?\*\/)|("[^"]*"|'[^']*')|(#[0-9a-fA-F]{3,8})|(--[\w-]+|@[\w-]+)|([\w-]+)(?=\s*:)|(\b\d+(?:\.\d+)?(?:px|rem|em|%|vh|vw|s|ms|fr|deg)?\b)/g
  let last = 0
  let match = pattern.exec(source)
  while (match) {
    if (match.index > last) tokens.push({ text: source.slice(last, match.index) })
    const [text] = match
    const color = match[1]
      ? COLOR.comment
      : match[2]
        ? COLOR.string
        : match[3]
          ? COLOR.number
          : match[4]
            ? COLOR.keyword
            : match[5]
              ? COLOR.attr
              : COLOR.number
    tokens.push({ text, color })
    last = match.index + text.length
    match = pattern.exec(source)
  }
  if (last < source.length) tokens.push({ text: source.slice(last) })
  return tokens
}

function script(source: string): Token[] {
  const tokens: Token[] = []
  const pattern =
    /(\/\*[\s\S]*?(?:\*\/|$)|\/\/[^\n]*|#[^\n]*)|(`[\s\S]*?(?:`|$)|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')|(\b\d+(?:\.\d+)?\b)|([A-Za-z_$][\w$]*)|([{}()[\].,;:=<>+\-*/!?&|]+)/g
  let last = 0
  let match = pattern.exec(source)
  while (match) {
    if (match.index > last) tokens.push({ text: source.slice(last, match.index) })
    const [text] = match
    let color: string | undefined
    if (match[1]) color = COLOR.comment
    else if (match[2]) color = COLOR.string
    else if (match[3]) color = COLOR.number
    else if (match[4]) color = KEYWORDS.test(text) ? COLOR.keyword : TYPES.test(text) ? COLOR.type : undefined
    else color = COLOR.punct
    tokens.push({ text, color })
    last = match.index + text.length
    match = pattern.exec(source)
  }
  if (last < source.length) tokens.push({ text: source.slice(last) })
  return tokens
}

function tokenize(source: string, path: string): Token[] {
  const ext = path.split('.').pop()?.toLowerCase() || ''
  if (ext === 'html' || ext === 'htm' || ext === 'xml' || ext === 'svg' || ext === 'vue') return web(source)
  if (ext === 'css' || ext === 'scss' || ext === 'less') return css(source)
  if (ext === 'md' || ext === 'markdown' || ext === 'txt' || ext === 'csv') return [{ text: source }]
  return script(source)
}

function nodes(tokens: Token[]): ReactNode {
  return tokens.map((token, index) =>
    token.color ? (
      <span key={index} style={{ color: token.color }}>
        {token.text}
      </span>
    ) : (
      <span key={index}>{token.text}</span>
    ),
  )
}

/** Colors one line of source for the diff view and the editor. */
export function highlight(line: string, path: string): ReactNode {
  if (!line) return line
  return nodes(tokenize(line, path))
}

/** Colors a whole file so the Files editor can show syntax. */
export function highlightSource(source: string, path: string): ReactNode {
  if (!source) return source
  return nodes(tokenize(source, path))
}
