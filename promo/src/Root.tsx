import React from 'react';
import { Composition } from 'remotion';
import { Promo } from './Promo';
import { Cuts, Draft, CUTS_FRAMES, FPS } from './Cuts';
export const Root = () => (
  <>
    <Composition id="Promo" component={Promo} durationInFrames={900} fps={30} width={1080} height={1920} />
    {/* 3.0：真機錄影剪輯（見 Cuts.tsx） */}
    <Composition id="Cuts" component={Cuts} durationInFrames={CUTS_FRAMES} fps={FPS} width={1080} height={1920} />
    <Composition id="Draft" component={Draft} durationInFrames={CUTS_FRAMES + 180} fps={FPS} width={1080} height={1920} />
  </>
);
