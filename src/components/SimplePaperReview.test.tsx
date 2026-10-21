import {renderToStaticMarkup} from 'react-dom/server'
import {expect,it} from 'vitest'
import SimplePaperReview from './SimplePaperReview'
import {SIMPLE_SETTINGS,SIMPLE_SOURCE_QUESTIONS} from '../lib/fixtures/simpleExamSource'

it('matches shared header/mark rules on the student sheet while retaining teacher mark controls',()=>{
 const html=renderToStaticMarkup(<SimplePaperReview questions={SIMPLE_SOURCE_QUESTIONS} settings={SIMPLE_SETTINGS}
  totalMarks={3} focusedIndex={0} onFocusQuestion={()=>{}} renderControls={()=><button>Adjust question marks</button>}/>)
 const sheet=html.slice(html.indexOf('<article'))
 const header=sheet.match(/<header[^>]*>([\s\S]*?)<\/header>/)![1]
 expect(header.indexOf('Grade 6')).toBeLessThan(header.indexOf(SIMPLE_SETTINGS.examTitle))
 expect(header.indexOf(SIMPLE_SETTINGS.examTitle)).toBeLessThan(header.indexOf(SIMPLE_SETTINGS.schoolName))
 expect(sheet).not.toContain('class="ministry-mark"')
 expect(sheet).toContain('3 marks')
 expect(sheet).toContain('Adjust question marks')
 expect(html).toContain('paper-plan-marks')
})
