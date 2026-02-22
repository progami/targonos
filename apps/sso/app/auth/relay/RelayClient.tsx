"use client"

import { useEffect } from 'react'

export default function RelayClient({ to }: { to: string }) {
  useEffect(() => {
    window.location.replace(to)
  }, [to])

  return (
    <div style={{minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'linear-gradient(180deg, #ffffff 0%, #f8f9fa 100%)', padding:16}}>
      <div style={{textAlign:'center'}}>
        <div style={{marginBottom:24}}>
          <div style={{
            width:64,
            height:64,
            margin:'0 auto',
            background:'linear-gradient(135deg, #00C2B9 0%, #002C51 100%)',
            borderRadius:12,
            display:'flex',
            alignItems:'center',
            justifyContent:'center',
            animation:'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite'
          }}>
            <svg style={{width:32, height:32, color:'white'}} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 2L2 7L12 12L22 7L12 2Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M2 17L12 22L22 17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M2 12L12 17L22 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
        </div>
        <h1 style={{fontSize:24, fontWeight:700, color:'#002C51', marginBottom:8}}>Redirecting...</h1>
        <p style={{fontSize:16, color:'#6F7B8B'}}>Taking you to your application</p>
        <div style={{marginTop:24, display:'flex', justifyContent:'center', gap:8}}>
          <div style={{width:8, height:8, background:'#00C2B9', borderRadius:'50%', animation:'bounce 1.4s ease-in-out infinite'}}></div>
          <div style={{width:8, height:8, background:'#00C2B9', borderRadius:'50%', animation:'bounce 1.4s ease-in-out infinite', animationDelay:'0.2s'}}></div>
          <div style={{width:8, height:8, background:'#00C2B9', borderRadius:'50%', animation:'bounce 1.4s ease-in-out infinite', animationDelay:'0.4s'}}></div>
        </div>
      </div>
      <style jsx global>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.8; }
        }
        @keyframes bounce {
          0%, 100% { transform: translateY(0); opacity: 0.5; }
          50% { transform: translateY(-4px); opacity: 1; }
        }
      `}</style>
    </div>
  )
}

