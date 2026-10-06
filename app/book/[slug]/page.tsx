import type {Metadata} from "next";
import PublicBooking from '../../public-booking';
export const metadata:Metadata={title:"طلب موعد",robots:{index:false,follow:false}};
export default async function Page({params}:{params:Promise<{slug:string}>}){const {slug}=await params;return <PublicBooking slug={slug}/>;}
