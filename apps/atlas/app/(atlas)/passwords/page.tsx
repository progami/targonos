import { redirect } from 'next/navigation'

export default function PasswordsRedirectPage() {
  redirect('/secrets')
}

