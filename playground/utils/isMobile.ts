export const isMobile = 
  // Exclude new iPads that report as Mac
  !(/iPad/.test(navigator.platform) && /Mac OS X/i.test(navigator.userAgent)) &&
  (
    /iPhone|iPad|iPod/.test(navigator.platform) ||
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|CriOS|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
    (navigator.maxTouchPoints !== undefined && navigator.maxTouchPoints > 1)
  );