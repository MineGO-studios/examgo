import {expect,it} from 'vitest'
import {renderToStaticMarkup} from 'react-dom/server'
import QuestionBankBrowser from './QuestionBankBrowser'
import {EMPTY_BANK_FILTERS,type BankBrowserQuestion} from '../lib/questionBankBrowse'
const rows:BankBrowserQuestion[]=Array.from({length:28},(_,n)=>({id:String(n),prompt:'Published question '+n,unit:n%4+1,lesson:'Lesson '+n,question_type:n%2?'binary':'short-answer',difficulty:'easy',external_id:'Q'+n,is_active:true,content:{labelMode:'true-false'},answer:{isTrue:false,canonicalAnswer:'Answer'},options:null,correct_option_label:null}))
const props={questions:rows,linkedIds:new Set(['0']),filters:EMPTY_BANK_FILTERS,setFilters:()=>{},page:1,setPage:()=>{}}
it('uses the same unit overview and bounded question list for published banks',()=>{
 const html=renderToStaticMarkup(<QuestionBankBrowser {...props} readOnly />)
 for(const unit of [1,2,3,4])expect(html).toContain('Unit '+unit+', 7 questions, 7 published')
 expect(html).toContain('Search questions');expect(html).toContain('Type');expect(html).toContain('Context')
 expect((html.match(/class="question-row"/g)||[])).toHaveLength(25)
 expect(html).toContain('Page 1 of 2');expect(html).not.toContain('>Edit<');expect(html).not.toContain('ready for new papers')
})
it('applies the unit and text filters before rendering the shared list',()=>{
 const html=renderToStaticMarkup(<QuestionBankBrowser {...props} filters={{...EMPTY_BANK_FILTERS,unit:4,search:'question 7'}} readOnly />)
 expect(html).toContain('Published question 7');expect(html).not.toContain('Published question 3</p>')
 expect((html.match(/class="question-row"/g)||[])).toHaveLength(1)
})
it('preserves authoring actions for personal banks only',()=>{
 const html=renderToStaticMarkup(<QuestionBankBrowser {...props} onAction={()=>{}} actionLabel={()=>'Edit'} />)
 expect(html).toContain('ready for new papers');expect(html).toContain('>Edit</button>')
})
