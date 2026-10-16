import { motion } from 'motion/react';
import type { MemberEffect } from '../lib/member-effects';

interface Props {
  effect: MemberEffect;
  triggerKey: number;
  reduce: boolean;
}

const rand = (min: number, max: number) => Math.random() * (max - min) + min;

export function MemberTapEffect({ effect, triggerKey, reduce }: Props) {
  if (reduce || triggerKey <= 0) return null;

  return (
    <div
      key={`effect-${triggerKey}`}
      aria-hidden
      className="pointer-events-none absolute inset-0 z-40 overflow-visible"
    >
      {effect.kind === 'confetti' && <ConfettiBurst color={effect.color} color2={effect.color2} />}
      {effect.kind === 'sparkle'   && <SparkleBurst color={effect.color} color2={effect.color2} />}
      {effect.kind === 'lightning' && <LightningBurst color={effect.color} />}
      {effect.kind === 'hearts'    && <HeartsBurst color={effect.color} />}
      {effect.kind === 'stars'     && <StarsBurst color={effect.color} color2={effect.color2} />}
      {effect.kind === 'bubbles'   && <BubblesBurst color={effect.color} />}
      {effect.kind === 'petals'    && <PetalsBurst color={effect.color} color2={effect.color2} />}
      {effect.kind === 'snow'      && <SnowBurst color={effect.color} color2={effect.color2} />}
    </div>
  );
}

function ConfettiBurst({ color, color2 }: { color: string; color2?: string }) {
  const pieces = Array.from({ length: 18 });
  return (
    <>
      {pieces.map((_, i) => {
        const a = (i / pieces.length) * Math.PI * 2 + rand(-0.2, 0.2);
        const r = rand(60, 130);
        return (
          <motion.span
            key={i}
            initial={{ x: 0, y: 0, opacity: 1, rotate: 0, scale: 1 }}
            animate={{
              x: Math.cos(a) * r,
              y: Math.sin(a) * r + rand(20, 60),
              opacity: 0,
              rotate: rand(-360, 360),
              scale: rand(0.5, 1.1),
            }}
            transition={{ duration: rand(0.7, 1.1), ease: 'easeOut' }}
            className="absolute left-1/2 top-1/2 h-2 w-3"
            style={{
              backgroundColor: i % 2 && color2 ? color2 : color,
              transform: 'translate(-50%, -50%)',
            }}
          />
        );
      })}
    </>
  );
}

function SparkleBurst({ color, color2 }: { color: string; color2?: string }) {
  const sparks = Array.from({ length: 14 });
  return (
    <>
      {sparks.map((_, i) => {
        const a = (i / sparks.length) * Math.PI * 2;
        const r = rand(50, 100);
        return (
          <motion.span
            key={i}
            initial={{ x: 0, y: 0, opacity: 0, scale: 0 }}
            animate={{
              x: Math.cos(a) * r,
              y: Math.sin(a) * r,
              opacity: [0, 1, 0],
              scale: [0, 1.4, 0.6],
              rotate: 90,
            }}
            transition={{ duration: 0.75, ease: 'easeOut', delay: i * 0.02 }}
            className="absolute left-1/2 top-1/2 text-[14px]"
            style={{
              color: i % 2 && color2 ? color2 : color,
              transform: 'translate(-50%, -50%)',
              textShadow: `0 0 8px ${color}`,
            }}
          >
            ✦
          </motion.span>
        );
      })}
    </>
  );
}

function LightningBurst({ color }: { color: string }) {
  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 0.8, 0] }}
        transition={{ duration: 0.3 }}
        className="absolute inset-0"
        style={{
          background: `radial-gradient(circle, ${color}66 0%, transparent 60%)`,
          mixBlendMode: 'screen',
        }}
      />
      {Array.from({ length: 6 }).map((_, i) => {
        const a = (i / 6) * Math.PI * 2 + rand(-0.3, 0.3);
        const len = rand(70, 110);
        return (
          <motion.svg
            key={i}
            className="absolute left-1/2 top-1/2"
            style={{ transform: 'translate(-50%, -50%)', overflow: 'visible' }}
            width={1}
            height={1}
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 1, 0] }}
            transition={{ duration: 0.35, delay: i * 0.02 }}
          >
            <motion.line
              x1={0}
              y1={0}
              x2={Math.cos(a) * len}
              y2={Math.sin(a) * len}
              stroke={color}
              strokeWidth={2}
              strokeLinecap="round"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 0.25, ease: 'easeOut' }}
              style={{ filter: `drop-shadow(0 0 6px ${color})` }}
            />
          </motion.svg>
        );
      })}
    </>
  );
}

function HeartsBurst({ color }: { color: string }) {
  return (
    <>
      {Array.from({ length: 8 }).map((_, i) => {
        const a = rand(-Math.PI, 0);
        const r = rand(60, 110);
        return (
          <motion.span
            key={i}
            initial={{ x: 0, y: 0, opacity: 0, scale: 0.3 }}
            animate={{
              x: Math.cos(a) * r,
              y: Math.sin(a) * r,
              opacity: [0, 1, 1, 0],
              scale: [0.3, 1.2, 1, 0.6],
            }}
            transition={{ duration: rand(0.9, 1.3), ease: 'easeOut', delay: i * 0.04 }}
            className="absolute left-1/2 top-1/2 text-[16px]"
            style={{
              color,
              transform: 'translate(-50%, -50%)',
              filter: `drop-shadow(0 0 6px ${color})`,
            }}
          >
            ♥
          </motion.span>
        );
      })}
    </>
  );
}

function StarsBurst({ color, color2 }: { color: string; color2?: string }) {
  return (
    <>
      {Array.from({ length: 10 }).map((_, i) => {
        const a = rand(-Math.PI, 0);
        const r = rand(50, 110);
        return (
          <motion.span
            key={i}
            initial={{ x: 0, y: 0, opacity: 0, scale: 0, rotate: 0 }}
            animate={{
              x: Math.cos(a) * r,
              y: Math.sin(a) * r,
              opacity: [0, 1, 0],
              scale: [0, 1.3, 0.4],
              rotate: rand(-180, 180),
            }}
            transition={{ duration: rand(0.8, 1.1), ease: 'easeOut', delay: i * 0.03 }}
            className="absolute left-1/2 top-1/2 text-[14px]"
            style={{
              color: i % 2 && color2 ? color2 : color,
              transform: 'translate(-50%, -50%)',
              filter: `drop-shadow(0 0 6px ${color})`,
            }}
          >
            ★
          </motion.span>
        );
      })}
    </>
  );
}

function BubblesBurst({ color }: { color: string }) {
  return (
    <>
      {Array.from({ length: 10 }).map((_, i) => {
        const startX = rand(-60, 60);
        const startY = rand(20, 60);
        const size = rand(6, 14);
        return (
          <motion.span
            key={i}
            initial={{ x: startX, y: startY, opacity: 0, scale: 0.4 }}
            animate={{
              y: startY - rand(90, 140),
              x: startX + rand(-20, 20),
              opacity: [0, 1, 1, 0],
              scale: [0.4, 1, 1, 0.9],
            }}
            transition={{ duration: rand(1, 1.5), ease: 'easeOut', delay: i * 0.05 }}
            className="absolute left-1/2 top-1/2 rounded-full border-2"
            style={{
              width: size,
              height: size,
              borderColor: color,
              background: `${color}33`,
              transform: 'translate(-50%, -50%)',
              boxShadow: `0 0 10px ${color}66, inset 0 0 4px ${color}88`,
            }}
          />
        );
      })}
    </>
  );
}

function PetalsBurst({ color, color2 }: { color: string; color2?: string }) {
  return (
    <>
      {Array.from({ length: 12 }).map((_, i) => {
        const startX = rand(-80, 80);
        return (
          <motion.span
            key={i}
            initial={{ x: startX, y: -50, opacity: 0, rotate: rand(0, 360) }}
            animate={{
              y: rand(60, 120),
              x: startX + rand(-30, 30),
              opacity: [0, 1, 1, 0],
              rotate: rand(-360, 360),
            }}
            transition={{ duration: rand(1.2, 1.8), ease: 'easeInOut', delay: i * 0.05 }}
            className="absolute left-1/2 top-1/2 text-[14px]"
            style={{
              color: i % 2 && color2 ? color2 : color,
              transform: 'translate(-50%, -50%)',
              filter: `drop-shadow(0 0 4px ${color})`,
            }}
          >
            ❀
          </motion.span>
        );
      })}
    </>
  );
}

function SnowBurst({ color, color2 }: { color: string; color2?: string }) {
  return (
    <>
      {Array.from({ length: 14 }).map((_, i) => {
        const startX = rand(-90, 90);
        return (
          <motion.span
            key={i}
            initial={{ x: startX, y: -60, opacity: 0 }}
            animate={{
              y: rand(70, 130),
              x: startX + rand(-25, 25),
              opacity: [0, 1, 1, 0],
            }}
            transition={{ duration: rand(1.3, 2), ease: 'easeInOut', delay: i * 0.04 }}
            className="absolute left-1/2 top-1/2 text-[12px]"
            style={{
              color: i % 2 && color2 ? color2 : color,
              transform: 'translate(-50%, -50%)',
              filter: `drop-shadow(0 0 4px ${color})`,
            }}
          >
            ❄
          </motion.span>
        );
      })}
    </>
  );
}