import { useLenis } from './hooks/useLenis'
import { Nav } from './components/Nav'
import { World } from './gl/World'
import { Hud } from './components/hud/Hud'
import { Intro } from './sections/Intro'
import { Placeholder } from './sections/Placeholder'
import { Contact } from './sections/Contact'
import { profile } from './content/profile'

export default function App() {
  useLenis()

  return (
    <>
      <World />
      <Hud />
      <Nav />
      <main className="content">
        <Intro number={profile.sections[0].number} />
        <Placeholder
          id="work"
          index={1}
          number={profile.sections[1].number}
          title="Hobbies"
          body="Projects, placeholder — Phase 4."
        />
        <Placeholder
          id="experiments"
          index={2}
          number={profile.sections[2].number}
          title="Learnings"
          body="Fields I'm exploring, placeholder — Phase 5."
        />
        <Placeholder
          id="about"
          index={3}
          number={profile.sections[3].number}
          title="About"
          body="Curiosity, the pilot dream, sports, friends — Phase 5."
        />
        <Contact index={4} number={profile.sections[4].number} />
      </main>
    </>
  )
}
