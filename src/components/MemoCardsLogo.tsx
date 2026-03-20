import logoImg from '@/assets/logo-memo.png';

const MemoCardsLogo = ({ size = 40, className = '' }: { size?: number; className?: string }) => {
  return (
    <img
      src={logoImg}
      alt="MemoCards"
      width={size}
      height={size}
      className={`${className}`}
      style={{ objectFit: 'contain' }}
    />
  );
};

export default MemoCardsLogo;
