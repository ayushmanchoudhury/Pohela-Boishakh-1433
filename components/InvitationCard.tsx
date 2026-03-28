'use client'

import { motion } from 'framer-motion'
import Image from 'next/image'
import { useState } from 'react'

// Landscape 7:5 — 480/1.4 ≈ 342
export const CARD_W = 480
export const CARD_H = 342

function PlaceholderFace({ face }: { face: 'front' | 'back' }) {
  return (
    <div style={{
      position: 'absolute',
      inset: 0,
      background: face === 'front'
        ? 'linear-gradient(148deg, #faf8f4 0%, #f5f0e8 100%)'
        : 'linear-gradient(148deg, #f8f5f0 0%, #f1ece3 100%)',
    }} />
  )
}

function CardFace({ src, alt, side, priority }: { src: string; alt: string; side: 'front' | 'back'; priority?: boolean }) {
  const [loaded, setLoaded] = useState(false)
  const [errored, setErrored] = useState(false)

  return (
    <>
      <PlaceholderFace face={side} />
      {!errored && (
        <Image
          src={src}
          alt={alt}
          fill
          style={{ objectFit: 'cover', opacity: loaded ? 1 : 0, transition: 'opacity 0.4s ease' }}
          priority={priority}
          draggable={false}
          onLoad={() => setLoaded(true)}
          onError={() => setErrored(true)}
        />
      )}
    </>
  )
}

interface Props {
  isFlipped: boolean
  onClick: () => void
  language?: 'en' | 'bn'
}

export default function InvitationCard({ isFlipped, onClick, language = 'en' }: Props) {
  const frontSrc = language === 'bn' ? '/Bangla-Card-Front.jpeg' : '/card-front.png'
  const backSrc  = language === 'bn' ? '/Bangla-card-back.jpeg'  : '/card-back.png'

  return (
    <div onClick={onClick} style={{ width: CARD_W, height: CARD_H, perspective: '1400px', cursor: 'pointer' }}>
      <motion.div
        style={{ width: '100%', height: '100%', position: 'relative', transformStyle: 'preserve-3d', willChange: 'transform' }}
        animate={{ rotateY: isFlipped ? 180 : 0 }}
        transition={{ duration: 0.9, ease: [0.25, 0.46, 0.45, 0.94] }}
      >
        <div style={{
          position: 'absolute', inset: 0,
          backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden',
          borderRadius: 2, overflow: 'hidden',
          boxShadow: '0 28px 70px rgba(0,0,0,0.22), 0 10px 28px rgba(0,0,0,0.12), 0 2px 6px rgba(0,0,0,0.07)',
        }}>
          <CardFace src={frontSrc} alt="Invitation – front" side="front" priority />
        </div>

        <div style={{
          position: 'absolute', inset: 0,
          transform: 'rotateY(180deg)',
          backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden',
          borderRadius: 2, overflow: 'hidden',
          boxShadow: '0 28px 70px rgba(0,0,0,0.22), 0 10px 28px rgba(0,0,0,0.12), 0 2px 6px rgba(0,0,0,0.07)',
        }}>
          <CardFace src={backSrc} alt="Invitation – back" side="back" />
        </div>
      </motion.div>
    </div>
  )
}
