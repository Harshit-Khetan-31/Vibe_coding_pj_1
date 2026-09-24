import { useState } from 'react'
import { useLenis } from './hooks/useLenis'
import { Loader } from './components/loader/Loader'
import { Nav } from './components/Nav'
import { Header } from './components/Header'
import { World } from './gl/World'
import { Hud } from './components/hud/Hud'
import { Intro } from './sections/Intro'
import { Placeholder } from './sections/Placeholder'
import { Contact } from './sections/Contact'
import { loaderShouldPlay } from './flight/store'
import { profile } from './content/profile'

export default function App() {
  useLenis()
  /**
   * The takeoff plays once per session, and the decision is the store's so that
   * the masthead asks the same question and gets the same answer. The overlay
   * unmounts itself through `onDone`; everything underneath it is mounted from
   * the first frame and loads behind it.
   */
  const [loading, setLoading] = useState(loaderShouldPlay)

  return (
    <>
      {loading && <Loader onDone={() => setLoading(false)} />}
      <World />
      <Hud />
      <Header />
      <Nav />
      <main className="content">
        <Intro number={profile.sections[0].number} />
        <Placeholder
          id="work"
          index={1}
          number={profile.sections[1].number}
          title="Hobbies"
          body="Sports, art, vibe coding, sleeping."
        />
        <Placeholder
          id="experiments"
          index={2}
          number={profile.sections[2].number}
          title="Learnings"
          body="Prompt engineering, Google skills, Claude Code, Google Cloud."
        />
        <Placeholder
          id="about"
          index={3}
          number={profile.sections[3].number}
          title="About"
          body="A boy who wants to explore the world, learn new things, meet different people, make friends and live a happy life."
        />
        <Contact index={4} number={profile.sections[4].number} />
      </main>
    </>
  )
}
