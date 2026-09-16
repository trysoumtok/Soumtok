function pdfEscape(value: string) {
  return value.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)')
}

function wrap(text: string, width: number) {
  const words = text.split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let line = ''
  for (const word of words) {
    const next = line ? `${line} ${word}` : word
    if (next.length > width) {
      if (line) lines.push(line)
      line = word
    } else {
      line = next
    }
  }
  if (line) lines.push(line)
  return lines
}

export function receiptPdf(input: {
  receiptNumber: string
  planName: string
  cycle: string
  amount: string
  currency: string
  method: string
  paidAt: string
  periodStart: string
  periodEnd: string
  email?: string
}) {
  const billed = input.cycle === 'annual' ? 'Annual' : 'Monthly'
  const lines = [
    'SOWN',
    'Payment receipt',
    '',
    input.receiptNumber,
    input.paidAt,
    '',
    `Soumtok ${input.planName}  ·  ${billed}`,
    `${input.currency} ${input.amount}`,
    '',
    `Paid with ${input.method}`,
    `Period starts  ${input.periodStart}`,
    `Renews  ${input.periodEnd}`,
    input.email ? `Billed to  ${input.email}` : '',
    '',
    'Thank you. Keep this receipt for your records.',
    'soumtok.com',
  ].filter((line) => line !== undefined)

  const commands: string[] = []
  let y = 720
  for (const [index, line] of lines.entries()) {
    const size = index === 0 ? 22 : index === 1 ? 14 : 11
    const pieces = wrap(line, 78)
    for (const piece of pieces) {
      commands.push(`BT /F1 ${size} Tf 56 ${y} Td (${pdfEscape(piece)}) Tj ET`)
      y -= index === 0 ? 28 : 18
    }
  }

  const stream = commands.join('\n')
  const objects = [
    '1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj',
    '2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj',
    '3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj',
    `4 0 obj << /Length ${Buffer.byteLength(stream)} >> stream\n${stream}\nendstream endobj`,
    '5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj',
  ]

  let offset = 9
  const offsets = [0]
  let body = '%PDF-1.4\n'
  for (const object of objects) {
    offsets.push(offset)
    body += `${object}\n`
    offset += Buffer.byteLength(`${object}\n`)
  }
  const xref = offset
  const table = ['xref', '0 6', '0000000000 65535 f ']
  for (const value of offsets.slice(1)) {
    table.push(`${String(value).padStart(10, '0')} 00000 n `)
  }
  body += `${table.join('\n')}\n`
  body += `trailer << /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`
  return Buffer.from(body, 'utf8')
}
