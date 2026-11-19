namespace $ {

	/** Поддельный сокет: открывается через заданную задержку, либо молчит. */
	class $bog_yard_test_socket {

		static made = [] as $bog_yard_test_socket[]

		static delays = new Map< string, number >()

		static reset() {
			this.made = []
			this.delays.clear()
		}

		binaryType = ''
		closed = false
		onopen: null | ( ()=> void ) = null
		onerror: null | ( ()=> void ) = null
		onclose: null | ( ()=> void ) = null
		onmessage: null | ( ( event: any )=> void ) = null

		constructor( readonly url: string ) {
			$bog_yard_test_socket.made.push( this )
			const delay = $bog_yard_test_socket.delays.get( url )
			if( delay == null ) return
			setTimeout( ()=> this.onopen?.(), delay )
		}

		send() {}

		close() {
			this.closed = true
		}

	}

	/** Контекст с поддельным `WebSocket` и подменённым синхронизатором. */
	function $bog_yard_test_context( ambient: typeof $$, Yard: typeof $bog_yard ) {
		const context = Object.create( ambient ) as typeof $$
		const win = new EventTarget
		const doc = Object.assign( new EventTarget, { visibilityState: 'visible' } )
		context.$mol_dom_context = Object.create( ambient.$mol_dom_context, {
			WebSocket: { value: $bog_yard_test_socket },
			document: { value: doc },
			navigator: { value: {} },
			addEventListener: { value: win.addEventListener.bind( win ) },
			removeEventListener: { value: win.removeEventListener.bind( win ) },
			dispatchEvent: { value: win.dispatchEvent.bind( win ) },
		} )
		context.$giper_baza_yard = Yard
		return context
	}

	function $bog_yard_test_visibility( $: typeof $$, state: 'visible' | 'hidden' ) {
		const doc = $.$mol_dom_context.document as any
		doc.visibilityState = state
		doc.dispatchEvent( new Event( 'visibilitychange' ) )
	}

	$mol_test({

		async 'Молчащий мастер в начале списка не задерживает подключение к живому'( $ ) {

			$bog_yard_test_socket.reset()
			$bog_yard_test_socket.delays.set( 'wss://alive.example/', 5 )

			class Yard extends $bog_yard {
				static override stagger = 10
				static override masters() {
					return [ 'https://silent.example/', 'https://alive.example/' ]
				}
			}

			const yard = Yard.make({ $: $bog_yard_test_context( $, Yard ) })
			const began = Date.now()
			const port = await $mol_wire_async( yard ).master()
			const spent = Date.now() - began

			$mol_assert_equal( yard.master_cursor(), 1 )
			$mol_assert_equal( ( port as any ).socket.url, 'wss://alive.example/' )
			$mol_assert_equal( $bog_yard_test_socket.made[ 0 ].closed, true )
			$mol_assert_equal( spent < 500, true )
			$mol_assert_equal( yard.master_rtt() > 0, true )

			port!.destructor()

		},

		async 'Обрыв связи сдвигает курсор на следующего мастера'( $ ) {

			$bog_yard_test_socket.reset()
			$bog_yard_test_socket.delays.set( 'wss://alive.example/', 5 )

			class Yard extends $bog_yard {
				static override stagger = 10
				static override reconnect_delay = 1
				static override masters() {
					return [ 'https://silent.example/', 'https://alive.example/' ]
				}
			}

			const yard = Yard.make({ $: $bog_yard_test_context( $, Yard ) })
			const port = await $mol_wire_async( yard ).master()

			$mol_assert_equal( yard.master_cursor(), 1 )

			;( ( port as any ).socket as $bog_yard_test_socket ).onclose?.()
			await new Promise( done => setTimeout( done, 20 ) )

			$mol_assert_equal( yard.master_cursor(), 0 )

			port!.destructor()

		},

		async 'Вернувшаяся сеть переподключает к тому же мастеру'( $ ) {

			$bog_yard_test_socket.reset()
			$bog_yard_test_socket.delays.set( 'wss://alive.example/', 5 )

			class Yard extends $bog_yard {
				static override masters() {
					return [ 'https://alive.example/' ]
				}
			}

			const context = $bog_yard_test_context( $, Yard )
			const yard = Yard.make({ $: context })
			await $mol_wire_async( yard ).master()

			context.$mol_dom_context.dispatchEvent( new Event( 'online' ) )
			const port = await $mol_wire_async( yard ).master()

			$mol_assert_equal( $bog_yard_test_socket.made.length, 2 )
			$mol_assert_equal( $bog_yard_test_socket.made[ 0 ].closed, true )
			$mol_assert_equal( ( port as any ).socket, $bog_yard_test_socket.made[ 1 ] )
			$mol_assert_equal( yard.master_cursor(), 0 )

			port!.destructor()

		},

		async 'Короткий уход в фон связь не трогает, долгий переподключает'( $ ) {

			$bog_yard_test_socket.reset()
			$bog_yard_test_socket.delays.set( 'wss://alive.example/', 5 )

			class Yard extends $bog_yard {
				static override wake_after = 30
				static override masters() {
					return [ 'https://alive.example/' ]
				}
			}

			const context = $bog_yard_test_context( $, Yard )
			const yard = Yard.make({ $: context })
			await $mol_wire_async( yard ).master()

			$bog_yard_test_visibility( context, 'hidden' )
			$bog_yard_test_visibility( context, 'visible' )
			await $mol_wire_async( yard ).master()

			$mol_assert_equal( $bog_yard_test_socket.made.length, 1 )

			$bog_yard_test_visibility( context, 'hidden' )
			await new Promise( done => setTimeout( done, 40 ) )
			$bog_yard_test_visibility( context, 'visible' )
			const port = await $mol_wire_async( yard ).master()

			$mol_assert_equal( $bog_yard_test_socket.made.length, 2 )
			$mol_assert_equal( $bog_yard_test_socket.made[ 0 ].closed, true )

			port!.destructor()

		},

		async 'Проверка выбирает мастера, который открывается быстрее'( $ ) {

			$bog_yard_test_socket.reset()
			$bog_yard_test_socket.delays.set( 'wss://slow.example/', 60 )
			$bog_yard_test_socket.delays.set( 'wss://fast.example/', 5 )

			class Yard extends $bog_yard {
				static override masters() {
					return [ 'https://current.example/', 'https://slow.example/', 'https://fast.example/' ]
				}
			}

			const yard = Yard.make({ $: $bog_yard_test_context( $, Yard ) })
			const best = await $mol_wire_async( yard ).probe_best( 0 )

			$mol_assert_equal( best?.index, 2 )
			$mol_assert_equal( best!.rtt < 50, true )
			$mol_assert_equal( $bog_yard_test_socket.made.every( socket => socket.closed ), true )

		},

		async 'Проверка переключается на заметно более быстрого мастера'( $ ) {

			$bog_yard_test_socket.reset()
			$bog_yard_test_socket.delays.set( 'wss://fast.example/', 5 )

			class Yard extends $bog_yard {
				static override switch_margin = 0
				static override masters() {
					return [ 'https://current.example/', 'https://fast.example/' ]
				}
			}

			const yard = Yard.make({ $: $bog_yard_test_context( $, Yard ) })
			yard.master_cursor( 0 )
			yard.master_rtt( 100 )

			const switched = await $mol_wire_async( yard ).probe_check()

			$mol_assert_equal( switched, true )
			$mol_assert_equal( yard.master_cursor(), 1 )
			$mol_assert_equal( yard.master_rtt() < 50, true )

		},

		async 'Проверка не трогает связь, если кандидат не быстрее'( $ ) {

			$bog_yard_test_socket.reset()
			$bog_yard_test_socket.delays.set( 'wss://other.example/', 5 )

			class Yard extends $bog_yard {
				static override masters() {
					return [ 'https://current.example/', 'https://other.example/' ]
				}
			}

			const yard = Yard.make({ $: $bog_yard_test_context( $, Yard ) })
			yard.master_cursor( 0 )
			yard.master_rtt( 50 )

			const switched = await $mol_wire_async( yard ).probe_check()

			$mol_assert_equal( switched, false )
			$mol_assert_equal( yard.master_cursor(), 0 )
			$mol_assert_equal( yard.master_rtt(), 50 )

		},

	})

}
