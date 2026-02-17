import { useEffect, useState } from 'react';

interface EnergyFloaterProps {
  trigger: number;
}

const EnergyFloater = ({ trigger }: EnergyFloaterProps) => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (trigger > 0) {
      setVisible(true);
      const timer = setTimeout(() => setVisible(false), 1800);
      return () => clearTimeout(timer);
    }
  }, [trigger]);

  if (!visible) return null;

  return null; // Rendering is now handled inline by StatusBar
};

export default EnergyFloater;
