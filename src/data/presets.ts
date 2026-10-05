export interface SizePreset {
  id: string;
  name: string;
  width: number;
  height: number;
  group: string;
  icon: string;
}

export const SIZE_PRESETS: SizePreset[] = [
  { id: 'ig-post', name: 'Instagram Post', width: 1080, height: 1080, group: 'Social', icon: 'Camera' },
  { id: 'ig-portrait', name: 'Instagram Portrait', width: 1080, height: 1350, group: 'Social', icon: 'Camera' },
  { id: 'ig-story', name: 'Story / Reel', width: 1080, height: 1920, group: 'Social', icon: 'Smartphone' },
  { id: 'fb-post', name: 'Facebook Post', width: 1200, height: 630, group: 'Social', icon: 'ThumbsUp' },
  { id: 'fb-cover', name: 'Facebook Cover', width: 1640, height: 624, group: 'Social', icon: 'ThumbsUp' },
  { id: 'x-post', name: 'X / Twitter Post', width: 1600, height: 900, group: 'Social', icon: 'MessageCircle' },
  { id: 'yt-thumb', name: 'YouTube Thumbnail', width: 1280, height: 720, group: 'Social', icon: 'Play' },
  { id: 'yt-banner', name: 'YouTube Banner', width: 2560, height: 1440, group: 'Social', icon: 'Play' },
  { id: 'li-post', name: 'LinkedIn Post', width: 1200, height: 1200, group: 'Social', icon: 'Briefcase' },
  { id: 'pin', name: 'Pinterest Pin', width: 1000, height: 1500, group: 'Social', icon: 'Pin' },
  { id: 'pres', name: 'Presentation', width: 1920, height: 1080, group: 'Docs', icon: 'Presentation' },
  { id: 'a4', name: 'A4 Document', width: 2480, height: 3508, group: 'Print', icon: 'FileText' },
  { id: 'poster', name: 'Poster', width: 1240, height: 1754, group: 'Print', icon: 'FileImage' },
  { id: 'flyer', name: 'Flyer (Letter)', width: 2550, height: 3300, group: 'Print', icon: 'FileText' },
  { id: 'card', name: 'Business Card', width: 1050, height: 600, group: 'Print', icon: 'CreditCard' },
  { id: 'invite', name: 'Invitation', width: 1500, height: 2100, group: 'Print', icon: 'Mail' },
  { id: 'logo', name: 'Logo', width: 1000, height: 1000, group: 'Brand', icon: 'Hexagon' },
  { id: 'hd', name: 'Desktop Wallpaper', width: 1920, height: 1080, group: 'Screen', icon: 'Monitor' },
  { id: '4k', name: '4K UHD', width: 3840, height: 2160, group: 'Screen', icon: 'Monitor' },
  { id: 'phone', name: 'Phone Wallpaper', width: 1170, height: 2532, group: 'Screen', icon: 'Smartphone' },
];
