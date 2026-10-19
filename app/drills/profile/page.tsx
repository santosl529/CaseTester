import { redirect } from 'next/navigation';

// Your skills became Your progress (docs/prd-drills.md "Your progress").
export default function SkillProfilePage() {
  redirect('/drills/progress');
}
