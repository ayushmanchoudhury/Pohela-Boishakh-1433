import Envelope from '@/components/Envelope'

export default function Home() {
  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(150deg, #f5f1ec 0%, #ede7df 55%, #e8e1d8 100%)',
        position: 'relative',
        overflowX: 'hidden',
      }}
    >
      {/* Subtle radial accent */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage:
            'radial-gradient(ellipse 65% 55% at 50% 45%, rgba(255,250,240,0.55) 0%, transparent 70%)',
          pointerEvents: 'none',
        }}
      />
      <Envelope />
    </main>
  )
}
