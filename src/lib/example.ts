import type { Criterion, Option, Scores } from './engine'

/** The worked example offered on an empty home screen (the job-offer board from the design). */
export function exampleMatrix(): { title: string; options: Option[]; criteria: Criterion[]; scores: Scores } {
  const options: Option[] = [
    { id: 'harbour', name: 'Harbour Bank' },
    { id: 'tide', name: 'Tidewater Studio' },
    { id: 'field', name: 'Fieldnote' },
  ]
  const rows: [string, string, number, number[]][] = [
    ['sal', 'Salary', 4, [9, 6, 7]],
    ['loc', 'Location', 3, [3, 9, 10]],
    ['gro', 'Growth', 5, [6, 7, 9]],
    ['sta', 'Stability', 3, [9, 6, 4]],
    ['tea', 'Team', 4, [6, 8, 7]],
  ]
  const criteria: Criterion[] = rows.map(([id, name, weight]) => ({ id, name, weight }))
  const scores: Scores = {}
  options.forEach((o, i) => {
    scores[o.id] = {}
    rows.forEach(([cid, , , s]) => (scores[o.id][cid] = s[i]))
  })
  return { title: 'Which offer do I take?', options, criteria, scores }
}
