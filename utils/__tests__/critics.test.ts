import { getCriticInfo, getStaffInfo } from '../critics';

describe('Critics Utility', () => {
  describe('getCriticInfo', () => {
    it('should return correct info for music critic', () => {
      const info = getCriticInfo('music');
      expect(info.name).toBe('Julian Pinter');
      expect(info.color).toBe('amber-400');
      expect(info.username).toBe('JulianPinter');
      expect(info.bio).toContain('headache');
    });

    it('should return correct info for film critic', () => {
      const info = getCriticInfo('film');
      expect(info.name).toBe('Rex Beaumont');
      expect(info.color).toBe('purple-400');
      expect(info.username).toBe('RexBeaumont');
      expect(info.bio).toContain('1.5x speed');
    });

    it('should return correct info for literary critic', () => {
      const info = getCriticInfo('literary');
      expect(info.name).toBe('Margot Ashford');
      expect(info.color).toBe('emerald-400');
      expect(info.username).toBe('MargotAshford');
      expect(info.bio).toContain('PhD');
    });

    it('should return correct info for business critic', () => {
      const info = getCriticInfo('business');
      expect(info.name).toBe('Patricia Chen');
      expect(info.color).toBe('blue-500');
      expect(info.username).toBe('PatriciaChen');
      expect(info.bio).toContain('jargon');
    });

    it('should return valid avatar URLs for all critics', () => {
      const types = ['music', 'film', 'literary', 'business'] as const;
      types.forEach(type => {
        const info = getCriticInfo(type);
        expect(info.avatar).toMatch(/^https:\/\/api\.dicebear\.com/);
        expect(info.avatar).toContain('seed=');
      });
    });
  });

  describe('getStaffInfo', () => {
    it('should return critic info for critic types', () => {
      const musicInfo = getStaffInfo('music');
      expect(musicInfo.name).toBe('Julian Pinter');
    });

    it('should return editor info for editor type', () => {
      const editorInfo = getStaffInfo('editor');
      expect(editorInfo.name).toBe('Chuck Morrison');
      expect(editorInfo.color).toBe('red-500');
      expect(editorInfo.username).toBe('ChuckMorrison');
      expect(editorInfo.bio).toContain('Editor-in-Chief');
    });

    it('should have consistent data structure across all staff', () => {
      const types = ['music', 'film', 'literary', 'business', 'editor'] as const;
      types.forEach(type => {
        const info = getStaffInfo(type);
        expect(info).toHaveProperty('name');
        expect(info).toHaveProperty('color');
        expect(info).toHaveProperty('avatar');
        expect(info).toHaveProperty('bio');
        expect(typeof info.name).toBe('string');
        expect(typeof info.color).toBe('string');
        expect(typeof info.avatar).toBe('string');
        expect(typeof info.bio).toBe('string');
      });
    });
  });
});
