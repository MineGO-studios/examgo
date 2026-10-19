import {describe,expect,it,vi} from 'vitest'
vi.mock('./supabase',()=>({supabase:{rpc:vi.fn()}}))
import {groupedPresetRenderSnapshot,parseEligiblePresetGroup,parseSavedPresetGroupExam,finalizePresetGroupExam} from './groupedPresetRepository'
import {supabase} from './supabase'
const id=(n:number)=>`123e4567-e89b-42d3-a456-${String(n).padStart(12,'0')}`
const provenance={schemaVersion:2,sourceReference:'Neutral public reference',corpusScope:'',ministerialOccurrences:null,missingEvidence:[]}
const member=(n:number)=>({revisionId:id(n),curationId:id(n+10),reviewVersion:3,revision:1,reviewer:'Fixture reviewer',approvedAt:'2026-10-03',
  publisher:'Fixture publisher',publishedAt:'2026-10-03',provenance,question:{id:id(n+20),type:'short-answer',unit:1,lesson:'1',difficulty:'medium',
    prompt:`Question ${n}?`,marks:3,answerLines:1,canonicalAnswer:'Fixture answer',approvedVariants:[],caseSensitive:false}})
const group={id:id(50),revision:2,instruction:'Answer one question.',attemptCount:1,members:[member(1),member(2)]}
const settings={schoolName:'Fixture school',examTitle:'Fixture exercise',teacherName:'Teacher',grade:6,unit:1,marksPerQuestion:3,questionCount:2,selectionSeed:17}
const saved={id:id(60),ownerId:id(70),sealed:true,savedAt:'2026-10-03',settings,group,totalMarks:3}
describe('complete group preset capture',()=>{
  it('projects exact source order with attempted rather than displayed marks and teacher-local render context',()=>{
    const paper=parseSavedPresetGroupExam(saved),snapshot=groupedPresetRenderSnapshot(paper)
    expect(snapshot.totalMarks).toBe(3);expect(snapshot.branches[0].attemptCount).toBe(1)
    expect(snapshot.branches[0].items.map(i=>i.question.id)).toEqual(group.members.map(m=>m.question.id))
    expect(snapshot.branches[0].items.every(i=>i.question.ownerId===saved.ownerId)).toBe(true)
    expect(snapshot.branches[0].pointMarks).toEqual({[id(21)]:3,[id(22)]:3})
  })
  it('rejects duplicate members, missing provenance and unsupported coverage',()=>{
    expect(()=>parseEligiblePresetGroup({...group,members:[member(1),member(1)]})).toThrow('distinct')
    expect(()=>parseEligiblePresetGroup({...group,members:[{...member(1),provenance:{...provenance,sourceReference:''}}]})).toThrow('provenance')
    expect(()=>parseEligiblePresetGroup({...group,members:[{...member(1),question:{...member(1).question,unit:2}}]})).toThrow('coverage')
  })
  it('rejects unsealed, unequal optional marks and inflated totals',()=>{
    expect(()=>parseSavedPresetGroupExam({...saved,sealed:false})).toThrow('seal')
    expect(()=>parseSavedPresetGroupExam({...saved,totalMarks:6})).toThrow('scoring')
    expect(()=>parseSavedPresetGroupExam({...saved,group:{...group,members:[member(1),{...member(2),question:{...member(2).question,marks:2}}]}})).toThrow('scoring')
  })
  it('verifies exact owner and group instruction in finalization readback',async()=>{
    const rpc=vi.mocked(supabase.rpc)
    rpc.mockResolvedValueOnce({data:saved,error:null} as never)
    await expect(finalizePresetGroupExam(id(80),settings,parseEligiblePresetGroup(group),3,saved.ownerId)).resolves.toMatchObject({totalMarks:3})
    rpc.mockResolvedValueOnce({data:{...saved,group:{...group,instruction:'Altered instruction.'}},error:null} as never)
    await expect(finalizePresetGroupExam(id(81),settings,parseEligiblePresetGroup(group),3,saved.ownerId)).rejects.toThrow('differs')
    rpc.mockResolvedValueOnce({data:{...saved,ownerId:id(71)},error:null} as never)
    await expect(finalizePresetGroupExam(id(82),settings,parseEligiblePresetGroup(group),3,saved.ownerId)).rejects.toThrow('differs')
    for(const altered of [{...member(1),question:{...member(1).question,prompt:'Changed question?'}},
      {...member(1),provenance:{...provenance,sourceReference:'Changed reference'}}]){
      rpc.mockResolvedValueOnce({data:{...saved,group:{...group,members:[altered,member(2)]}},error:null} as never)
      await expect(finalizePresetGroupExam(id(83),settings,parseEligiblePresetGroup(group),3,saved.ownerId)).rejects.toThrow('differs')
    }
  })
})
