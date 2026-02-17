import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

interface ElephantMascotProps {
  state: 'happy' | 'tired' | 'sleeping';
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
  socialMessage?: string;
}

const sizeMap = { sm: 48, md: 72, lg: 120 };

const ElephantSVG = ({ state, pixelSize }: { state: string; pixelSize: number }) => {
  const isHappy = state === 'happy';
  const isTired = state === 'tired';
  const isSleeping = state === 'sleeping';

  // Colors
  const bodyColor = isHappy ? '#2a9d6e' : isTired ? '#6b9d83' : '#8a9d92';
  const bodyDark = isHappy ? '#1f7d55' : isTired ? '#5a8a72' : '#728a7e';
  const bellyColor = isHappy ? '#b8f0d8' : isTired ? '#c8ddd2' : '#d0ddd6';
  const cheekColor = isHappy ? '#ff9eaa' : isTired ? '#d4a8a8' : '#bbb';
  const eyeWhite = '#fff';
  const pupilColor = '#1a1a2e';

  return (
    <svg
      width={pixelSize}
      height={pixelSize}
      viewBox="0 0 120 120"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Shadow */}
      <ellipse cx="60" cy="110" rx="30" ry="6" fill="#000" opacity="0.08" />

      {/* Body */}
      <ellipse cx="60" cy="62" rx="38" ry="40" fill={bodyColor} />

      {/* Belly */}
      <ellipse cx="60" cy="72" rx="22" ry="20" fill={bellyColor} />

      {/* Left ear */}
      <ellipse cx="26" cy="38" rx="16" ry="18" fill={bodyColor} />
      <ellipse cx="26" cy="38" rx="10" ry="12" fill={bellyColor} opacity="0.5" />

      {/* Right ear */}
      <ellipse cx="94" cy="38" rx="16" ry="18" fill={bodyColor} />
      <ellipse cx="94" cy="38" rx="10" ry="12" fill={bellyColor} opacity="0.5" />

      {/* Trunk */}
      <path
        d={`M 54 70 Q 50 82 46 90 Q 44 96 48 97 Q 52 98 54 92 Q 56 86 58 78`}
        stroke={bodyDark}
        strokeWidth="6"
        strokeLinecap="round"
        fill="none"
      />

      {/* Left foot */}
      <ellipse cx="44" cy="98" rx="10" ry="6" fill={bodyDark} />
      {/* Right foot */}
      <ellipse cx="76" cy="98" rx="10" ry="6" fill={bodyDark} />

      {/* Left toenails */}
      <circle cx="38" cy="96" r="2" fill={bellyColor} />
      <circle cx="42" cy="94" r="2" fill={bellyColor} />
      {/* Right toenails */}
      <circle cx="80" cy="96" r="2" fill={bellyColor} />
      <circle cx="76" cy="94" r="2" fill={bellyColor} />

      {/* Eyes */}
      {isSleeping ? (
        <>
          {/* Closed eyes - sleeping */}
          <path d="M 42 50 Q 47 54 52 50" stroke={pupilColor} strokeWidth="2.5" strokeLinecap="round" fill="none" />
          <path d="M 68 50 Q 73 54 78 50" stroke={pupilColor} strokeWidth="2.5" strokeLinecap="round" fill="none" />
        </>
      ) : isTired ? (
        <>
          {/* Half-open eyes */}
          <ellipse cx="47" cy="50" rx="8" ry="5" fill={eyeWhite} />
          <ellipse cx="73" cy="50" rx="8" ry="5" fill={eyeWhite} />
          <circle cx="48" cy="51" r="3.5" fill={pupilColor} />
          <circle cx="74" cy="51" r="3.5" fill={pupilColor} />
          <circle cx="49" cy="50" r="1.2" fill="#fff" />
          <circle cx="75" cy="50" r="1.2" fill="#fff" />
          {/* Droopy eyelids */}
          <path d="M 39 47 Q 47 44 55 47" fill={bodyColor} />
          <path d="M 65 47 Q 73 44 81 47" fill={bodyColor} />
        </>
      ) : (
        <>
          {/* Happy wide eyes */}
          <ellipse cx="47" cy="48" rx="9" ry="10" fill={eyeWhite} />
          <ellipse cx="73" cy="48" rx="9" ry="10" fill={eyeWhite} />
          {/* Pupils with highlight */}
          <circle cx="49" cy="49" r="5" fill={pupilColor} />
          <circle cx="75" cy="49" r="5" fill={pupilColor} />
          {/* Eye highlights */}
          <circle cx="51" cy="46" r="2" fill="#fff" />
          <circle cx="77" cy="46" r="2" fill="#fff" />
          <circle cx="48" cy="51" r="1" fill="#fff" />
          <circle cx="74" cy="51" r="1" fill="#fff" />
        </>
      )}

      {/* Cheeks */}
      <ellipse cx="34" cy="58" rx="6" ry="4" fill={cheekColor} opacity="0.6" />
      <ellipse cx="86" cy="58" rx="6" ry="4" fill={cheekColor} opacity="0.6" />

      {/* Mouth */}
      {isHappy ? (
        <path d="M 56 62 Q 60 68 64 62" stroke={bodyDark} strokeWidth="2" strokeLinecap="round" fill="none" />
      ) : isTired ? (
        <line x1="55" y1="64" x2="65" y2="64" stroke={bodyDark} strokeWidth="2" strokeLinecap="round" />
      ) : (
        /* Sleeping - slight frown */
        <path d="M 56 65 Q 60 63 64 65" stroke={bodyDark} strokeWidth="1.5" strokeLinecap="round" fill="none" />
      )}

      {/* Sleeping Zzz */}
      {isSleeping && (
        <>
          <text x="88" y="28" fontSize="12" fontWeight="900" fill="#6b9d83" opacity="0.8" className="animate-zzz">
            Z
          </text>
          <text x="96" y="18" fontSize="9" fontWeight="900" fill="#6b9d83" opacity="0.6" className="animate-zzz-delay">
            z
          </text>
          <text x="100" y="10" fontSize="7" fontWeight="900" fill="#6b9d83" opacity="0.4" className="animate-zzz">
            z
          </text>
        </>
      )}

      {/* Happy sparkles */}
      {isHappy && (
        <>
          <circle cx="18" cy="22" r="2" fill="#FFD700" opacity="0.7">
            <animate attributeName="opacity" values="0.7;0.2;0.7" dur="2s" repeatCount="indefinite" />
          </circle>
          <circle cx="102" cy="18" r="1.5" fill="#FFD700" opacity="0.5">
            <animate attributeName="opacity" values="0.5;0.1;0.5" dur="1.8s" repeatCount="indefinite" />
          </circle>
          <path d="M 12 35 l2-4 2 4-4-2 4 0z" fill="#FFD700" opacity="0.6">
            <animate attributeName="opacity" values="0.6;0.1;0.6" dur="2.5s" repeatCount="indefinite" />
          </path>
        </>
      )}

      {/* Tired sweat drop */}
      {isTired && (
        <path d="M 84 32 Q 86 28 88 32 Q 88 36 86 37 Q 84 36 84 32Z" fill="#87CEEB" opacity="0.7">
          <animate attributeName="opacity" values="0.7;0.3;0.7" dur="2s" repeatCount="indefinite" />
        </path>
      )}
    </svg>
  );
};

const animClasses: Record<string, string> = {
  happy: 'animate-elephant-bounce',
  tired: 'animate-elephant-breathe',
  sleeping: 'animate-elephant-sleep',
};

const labelConfig: Record<string, { label: string; sublabel: string }> = {
  happy: { label: 'Feliz!', sublabel: 'Estudando em dia' },
  tired: { label: 'Cansado...', sublabel: 'Faz dias sem estudar' },
  sleeping: { label: 'Dormindo...', sublabel: 'Perdeu o ritmo!' },
};

const ElephantMascot = ({ state, size = 'md', showLabel = false, socialMessage }: ElephantMascotProps) => {
  const pixelSize = sizeMap[size];
  const config = labelConfig[state];

  const mascotContent = (
    <div className="flex items-center gap-2.5">
      <div className={`relative ${animClasses[state]}`}>
        <ElephantSVG state={state} pixelSize={pixelSize} />
      </div>
      {showLabel && (
        <div>
          <p className="text-xs font-bold text-foreground leading-tight">{config.label}</p>
          <p className="text-[10px] text-muted-foreground leading-tight">{config.sublabel}</p>
        </div>
      )}
    </div>
  );

  if (socialMessage) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          {mascotContent}
        </TooltipTrigger>
        <TooltipContent side="top">
          <p className="text-xs">{socialMessage}</p>
        </TooltipContent>
      </Tooltip>
    );
  }

  return mascotContent;
};

export default ElephantMascot;
