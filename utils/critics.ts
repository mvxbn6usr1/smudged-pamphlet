// Shared critic information utility functions

export type CriticType = 'music' | 'film' | 'literary' | 'business';
export type StaffType = 'music' | 'film' | 'literary' | 'business' | 'editor';

export interface CriticInfo {
  name: string;
  username?: string;
  title?: string;
  publication?: string;
  color: string;
  avatar: string;
  bio: string;
}

export function getCriticInfo(criticType: CriticType): CriticInfo {
  switch (criticType) {
    case 'music':
      return {
        name: 'Julian Pinter',
        username: 'JulianPinter',
        title: 'Chief Critic',
        publication: 'The Smudged Pamphlet',
        color: 'amber-400',
        avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=julianpinter&mood=sad&eyebrows=angryNatural',
        bio: 'Chief Critic, has a headache.'
      };
    case 'film':
      return {
        name: 'Rex Beaumont',
        username: 'RexBeaumont',
        title: 'Film Critic',
        publication: 'The Smudged Pamphlet',
        color: 'purple-400',
        avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=rexbeaumont&glasses=prescription02&eyes=squint',
        bio: 'Film Critic, watches everything at 1.5x speed.'
      };
    case 'literary':
      return {
        name: 'Margot Ashford',
        username: 'MargotAshford',
        title: 'Literary Critic',
        publication: 'The Smudged Pamphlet',
        color: 'emerald-400',
        avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=margotashford&top=straightAndStrand&eyebrows=raisedExcited',
        bio: 'Literary Critic, three PhDs and counting.'
      };
    case 'business':
      return {
        name: 'Patricia Chen',
        username: 'PatriciaChen',
        title: 'Business Editor',
        publication: 'The Smudged Pamphlet',
        color: 'blue-500',
        avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=patriciachen&top=straight01&eyebrows=raisedExcitedNatural&eyes=eyeRoll&mouth=serious&skinColor=edb98a',
        bio: 'Business Editor, zero tolerance for corporate jargon.'
      };
  }
}

export function getStaffInfo(staffType: StaffType): CriticInfo {
  if (staffType === 'editor') {
    return {
      name: 'Chuck Morrison',
      username: 'ChuckMorrison',
      title: 'Editor-in-Chief',
      publication: 'The Smudged Pamphlet',
      color: 'red-500',
      avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=chuckmorrison&top=shortFlat&facialHair=beardMedium&eyebrows=default&mouth=smile&eyes=default&skinColor=ffdbb4',
      bio: 'Editor-in-Chief, likes it loud and simple.'
    };
  }

  return getCriticInfo(staffType);
}
