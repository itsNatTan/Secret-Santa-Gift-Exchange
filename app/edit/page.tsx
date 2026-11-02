import EditForm from "./edit-form";
export default async function EditPage({searchParams}:{searchParams:Promise<{token?:string}>}) {
  const {token=""}=await searchParams;
  return <main><div className="card"><h1>Update your gift exchange details</h1><p>Changes are allowed until registration closes.</p><EditForm token={token}/></div></main>;
}
