import { useState } from 'react'
import { Phone, Search, Truck, Mic, ArrowRight, GraduationCap, X, CheckCircle2, Eye } from 'lucide-react'
import { useLanguage } from '@/i18n/LanguageContext'

/** A short, big-text walkthrough for a person's first day. Every screen is one idea. */
export function FirstDayTour({ onClose, onPractice }: { onClose: () => void; onPractice: () => void }) {
  const { language } = useLanguage()
  const tx = (en: string, es: string) => (language === 'es' ? es : en)
  const [i, setI] = useState(0)

  const steps = [
    { icon: Eye, title: tx('Welcome', 'Bienvenido'), text: tx('This tour takes about two minutes. Nothing you click here changes a real family. You can leave any time with the X.', 'Este recorrido toma unos dos minutos. Nada de lo que haga aquí cambia a una familia real. Puede salir en cualquier momento con la X.') },
    { icon: Phone, title: tx('New First Call', 'Nueva llamada'), text: tx('When a family calls, press the big green "New First Call" button. Fill in what you know. Anything you do not know can stay blank and be added later.', 'Cuando llame una familia, presione el botón verde "Nueva llamada". Llene lo que sepa. Lo que no sepa puede quedar en blanco y agregarse después.') },
    { icon: Search, title: tx('Find a case', 'Buscar un caso'), text: tx('Press "Find a case" and type a name or case number. Click the name to open the case.', 'Presione "Buscar un caso" y escriba un nombre o número de caso. Haga clic en el nombre para abrirlo.') },
    { icon: ArrowRight, title: tx('The Next step box', 'El cuadro Siguiente paso'), text: tx('Every case has a box near the top that says what to do next, with one button. If you are not sure what comes next, just press that button.', 'Cada caso tiene un cuadro arriba que dice qué hacer a continuación, con un botón. Si no está seguro de qué sigue, presione ese botón.') },
    { icon: Truck, title: tx('Chain of Custody', 'Cadena de custodia'), text: tx('This shows where everyone in our care is right now. To move someone, drag their card to the next box, or use "Move to…" on a phone. Click a name to see their history.', 'Esto muestra dónde está cada persona a nuestro cuidado. Para mover a alguien, arrastre su tarjeta a la siguiente caja, o use "Mover a…" en el teléfono. Haga clic en un nombre para ver su historial.') },
    { icon: Mic, title: tx('Talk instead of type', 'Hable en vez de escribir'), text: tx('The microphone button at the top of every page lets you say a note out loud, such as "on the way with John Doe to Coachella Funeral Home". It writes it down and can move the person for you.', 'El botón del micrófono en la parte de arriba de cada página le permite decir una nota en voz alta. La escribe y puede mover a la persona por usted.') },
    { icon: GraduationCap, title: tx('Now try it', 'Ahora pruebe'), text: tx('Make a practice case and click around. When you are done, delete it from the Practice box on the home page. Practice cases never touch a real family.', 'Cree un caso de práctica y explore. Cuando termine, bórrelo desde el cuadro Práctica en la página principal. Los casos de práctica nunca afectan a una familia real.') },
  ]
  const s = steps[i]
  const Icon = s.icon
  const last = i === steps.length - 1

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true">
      <div className="relative w-full max-w-lg rounded-2xl bg-white p-7 shadow-2xl">
        <button onClick={onClose} aria-label={tx('Close', 'Cerrar')} className="absolute right-4 top-4 text-slate-400 hover:text-slate-700"><X size={22} /></button>
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[#3b4a35] text-white"><Icon size={28} /></div>
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{tx('Step', 'Paso')} {i + 1} / {steps.length}</div>
        <h2 className="mt-1 text-2xl font-display font-semibold text-slate-900">{s.title}</h2>
        <p className="mt-3 text-lg leading-relaxed text-slate-700">{s.text}</p>
        <div className="mt-6 flex items-center gap-3">
          {i > 0 && <button onClick={() => setI(i - 1)} className="rounded-lg border border-slate-300 px-4 py-2.5 font-medium text-slate-700 hover:bg-slate-50">{tx('Back', 'Atrás')}</button>}
          <div className="flex-1" />
          {last ? (
            <>
              <button onClick={onClose} className="rounded-lg border border-slate-300 px-4 py-2.5 font-medium text-slate-700 hover:bg-slate-50">{tx('Done', 'Listo')}</button>
              <button onClick={() => { onClose(); onPractice() }} className="inline-flex items-center gap-2 rounded-lg bg-[#3b4a35] px-5 py-2.5 font-semibold text-white hover:bg-[#4d5f45]"><CheckCircle2 size={18} /> {tx('Make a practice case', 'Crear caso de práctica')}</button>
            </>
          ) : (
            <button onClick={() => setI(i + 1)} className="rounded-lg bg-[#3b4a35] px-6 py-2.5 font-semibold text-white hover:bg-[#4d5f45]">{tx('Next', 'Siguiente')}</button>
          )}
        </div>
      </div>
    </div>
  )
}
