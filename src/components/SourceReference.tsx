/** Link deliberate public HTTPS references without changing neutral source text. */
export default function SourceReference({value}:{value:string}){
  const parts=[];let offset=0
  for(const match of value.matchAll(/https:\/\/[^\s<>]+/g)){
    const text=match[0].replace(/[.,;!?]+$/,'')
    const start=match.index
    parts.push(value.slice(offset,start))
    let href:string|null=null
    try{const url=new URL(text);if(url.protocol==='https:'&&!url.username&&!url.password)href=url.href}catch{ /* Keep malformed references as plain text. */ }
    parts.push(href?<a key={start} href={href} target="_blank" rel="noopener noreferrer">{text}</a>:text)
    offset=start+text.length
  }
  parts.push(value.slice(offset))
  return <bdi style={{overflowWrap:'anywhere'}}>{parts}</bdi>
}
