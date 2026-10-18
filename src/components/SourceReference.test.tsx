import {describe,expect,it} from 'vitest'
import {renderToStaticMarkup} from 'react-dom/server'
import SourceReference from './SourceReference'
describe('public source references',()=>{
  it('retains neutral context while linking traced question and key URLs',()=>{
    const html=renderToStaticMarkup(<SourceReference value="SRC-0009 question: https://t.me/KarrarMD6th/7951 ; key: https://t.me/KarrarMD6th/7952."/> )
    expect(html).toContain('SRC-0009 question: ')
    expect(html).toContain('href="https://t.me/KarrarMD6th/7951"')
    expect(html).toContain('href="https://t.me/KarrarMD6th/7952"')
    expect(html).toContain('rel="noopener noreferrer"')
  })
  it('keeps credentials and executable or malformed references non-clickable and escapes source text',()=>{
    const html=renderToStaticMarkup(<SourceReference value="<script> javascript:alert(1) https://name:secret@example.com/file https:// invalid"/> )
    expect(html).not.toContain('<a ')
    expect(html).toContain('&lt;script&gt;')
  })
})
