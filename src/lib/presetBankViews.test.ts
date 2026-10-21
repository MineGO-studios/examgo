import {expect,it} from 'vitest'
import {presetBankViews,presetUnitContent} from './presetBankViews'
import type {PresetBrowserGroup,PresetBrowserQuestion} from './presetBankRepository'
const bank={id:'source-bank',name:'Mid-Year Prototype',grade:6,subject:'English',publishedCount:8}
it('places four separate unit choices beside the original bank without inventing source bank IDs',()=>{
 const views=presetBankViews([bank])
 expect(views.map(view=>view.label)).toEqual(['Mid-Year Prototype (Preset)','Unit 1 (Preset)','Unit 2 (Preset)','Unit 3 (Preset)','Unit 4 (Preset)'])
 expect(new Set(views.map(view=>view.value)).size).toBe(5)
 expect(views.every(view=>view.bankId===bank.id)).toBe(true)
})
it('disambiguates unit names when multiple published banks exist',()=>{
 const views=presetBankViews([bank,{...bank,id:'another',name:'Another bank'}])
 expect(views[1].label).toBe('Mid-Year Prototype · Unit 1 (Preset)')
 expect(views[6].label).toBe('Another bank · Unit 1 (Preset)')
})
const questions=Array.from({length:8},(_,n)=>({id:'question-'+n,unit:Math.floor(n/2)+1})) as PresetBrowserQuestion[]
const groups=[{id:'cross-unit',questionIds:['question-0','question-2']},{id:'unit-four',questionIds:['question-6','question-7']}] as PresetBrowserGroup[]
it('each unit bank contains only its own question records, including unit four',()=>{
 for(const unit of [1,2,3,4]){
  const result=presetUnitContent(questions,groups,unit)
  expect(result.questions).toHaveLength(2)
  expect(result.questions.every(question=>question.unit===unit)).toBe(true)
 }
})
it('keeps complete passage context and excludes unrelated passages',()=>{
 const result=presetUnitContent(questions,groups,1)
 expect(result.groups).toEqual([groups[0]])
 expect(result.groups[0].questionIds).toEqual(['question-0','question-2'])
})
it('the combined bank retains every original question and group',()=>{
 const result=presetUnitContent(questions,groups)
 expect(result.questions).toBe(questions);expect(result.groups).toBe(groups)
})
