import {expect,it} from 'vitest'
import {renderToStaticMarkup} from 'react-dom/server'
import {ChoiceChips} from './controls'
const options=Array.from({length:6},(_,n)=>({value:String(n),label:'Bank '+n}))
it('keeps the existing dropdown behavior for more than five choices',()=>{
 const html=renderToStaticMarkup(<ChoiceChips legend="Banks" value="0" options={options} onChange={()=>{}} />)
 expect(html).toContain('<select');expect(html).not.toContain('type="radio"')
})
it('lets Active bank show six adjacent native radio choices without changing other selectors',()=>{
 const html=renderToStaticMarkup(<ChoiceChips legend="Active bank" value="0" options={options} onChange={()=>{}} maxInlineOptions={6} />)
 expect(html).not.toContain('<select');expect(html.match(/type="radio"/g)).toHaveLength(6)
})
