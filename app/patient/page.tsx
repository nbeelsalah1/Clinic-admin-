import type {Metadata} from "next";
import PatientPortal from '../patient-portal';
export const metadata:Metadata={title:{absolute:"بوابة المريض | عيادتي"},robots:{index:false,follow:false},alternates:{canonical:"/patient"}};
export default function Page(){return <PatientPortal/>;}
