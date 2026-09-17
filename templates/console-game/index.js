import readline from 'node:readline/promises'
import { stdin as input, stdout as output } from 'node:process'

const rl = readline.createInterface({ input, output })
console.log('{{title}}')
console.log('Guess the number 1–10. Type quit to exit.')

let score = 0
const secret = Math.floor(Math.random() * 10) + 1

while (true) {
  const guess = await rl.question('Your guess: ')
  const g = guess.trim().toLowerCase()
  if (g === 'quit' || g === 'exit') break
  const n = Number(g)
  if (!Number.isInteger(n)) {
    console.log('Enter a whole number 1–10.')
    continue
  }
  if (n === secret) {
    score += 1
    console.log(`Correct! Score: ${score}. New round…`)
    break
  }
  console.log(n < secret ? 'Higher.' : 'Lower.')
}

console.log(`Thanks for playing. Final score: ${score}`)
rl.close()
