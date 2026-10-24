import {expect,test} from '@playwright/test'
import {syntheticBackend,syntheticSignIn} from './support/syntheticBackend.ts'
import {checkAccessibility} from './support/accessibility.ts'
const bank='30000000-0000-4000-8000-000000000001'
const questions=[1,2,3,4].map(unit=>({id:'40000000-0000-4000-8000-'+String(unit).padStart(12,'0'),revisionId:'50000000-0000-4000-8000-'+String(unit).padStart(12,'0'),prompt:'Published unit '+unit,unit,lesson:'1',type:unit%2?'short-answer':'binary',difficulty:'easy',externalId:'PUB-'+unit,linked:false,content:{labelMode:'true-false',options:null},answer:{canonicalAnswer:'Correct',isTrue:true}}))
for(const personalBanks of [false,true])test('presets share Active bank and unit browser '+(personalBanks?'alongside personal banks':'for a fresh account'),async({page})=>{
 const state=await syntheticBackend(page)
 if(!personalBanks)state.tables.question_banks.splice(0)
 await page.route('**/rest/v1/rpc/get_preset_banks',route=>route.fulfill({json:[{id:bank,name:'Official bank',grade:6,subject:'English',publishedCount:4}]}))
 await page.route('**/rest/v1/rpc/get_preset_bank_browser',route=>route.fulfill({json:{version:'a'.repeat(32),questions,groups:[]}}))
 await syntheticSignIn(page,true,undefined,personalBanks)
 await page.getByRole('navigation',{name:'Teacher workspace'}).getByRole('button',{name:'Question banks',exact:true}).click()
 const active=page.getByRole('group',{name:'Active bank',exact:true})
 await active.getByRole('radio',{name:'Official bank (Preset)',exact:true}).check()
 const overview=page.getByRole('region',{name:'Questions by unit',exact:true})
 for(const unit of [1,2,3,4])await expect(overview.getByRole('button',{name:'Unit '+unit+', 1 question, 1 published',exact:true})).toBeVisible()
 await overview.getByRole('button',{name:'Unit 3, 1 question, 1 published',exact:true}).click()
 await expect(page.getByText('Published unit 3',{exact:true})).toBeVisible()
 await expect(page.getByText('Published unit 1',{exact:true})).toHaveCount(0)
 await expect(page.getByRole('button',{name:'Add question',exact:true})).toHaveCount(0)
 await expect(page.getByRole('button',{name:'Import file',exact:true})).toBeDisabled()
 await expect(page.getByRole('button',{name:'Manage banks',exact:true})).toBeDisabled()
 for(const unit of [1,2,3,4]){
  await active.getByRole('radio',{name:'Unit '+unit+' (Preset)',exact:true}).check()
  await expect(page.getByText('Published unit '+unit,{exact:true})).toBeVisible()
  for(const other of [1,2,3,4].filter(value=>value!==unit))await expect(page.getByText('Published unit '+other,{exact:true})).toHaveCount(0)
 }
 await active.getByRole('radio',{name:'Official bank (Preset)',exact:true}).check()
 await expect(page.getByText('Published unit 1',{exact:true})).toBeVisible()
 await expect(page.getByText('Published unit 4',{exact:true})).toBeVisible()
 await checkAccessibility(page)
 if(personalBanks){await active.getByRole('radio',{name:'Browser synthetic bank',exact:true}).check();await expect(page.getByRole('button',{name:'Add question',exact:true})).toBeVisible()}
 expect(state.unhandled).toEqual([])
})
