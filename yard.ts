namespace $ {

	export class $bog_yard extends $giper_baza_yard {

		static stagger = 300 // ms

		/** Как часто проверяем, не появился ли мастер быстрее текущего. */
		static probe_period = 20_000 // ms

		/** Сколько ждём пробные сокеты, прежде чем считать их молчащими. */
		static probe_timeout = 5_000 // ms

		/** Насколько быстрее должен быть кандидат, чтобы ради него рвать связь. */
		static switch_margin = 200 // ms

		/** Пауза перед переподключением после обрыва. */
		static reconnect_delay = 1_000 // ms

		/** За сколько открылся мастер, с которым работаем сейчас. */
		@ $mol_mem
		master_rtt( next = 0 ) {
			return next
		}

		port_make( socket: WebSocket, link: string ) {

			const port = new $mol_rest_port_ws_std
			port.socket = socket

			const stop_probe = this.probe_loop()
			const delay = ( this.constructor as typeof $bog_yard ).reconnect_delay

			socket.onmessage = async( event )=> {

				if( event.data instanceof ArrayBuffer ) {
					if( !event.data.byteLength ) return
					await $mol_wire_async( this ).port_income( port, new Uint8Array( event.data ) )
					return
				}

				this.$.$mol_log3_fail({
					place: this,
					message: 'Wrong data',
					data: event.data,
				})

			}

			const beat = setInterval( ()=> socket.send( new Uint8Array ), 30000 )

			socket.onclose = ()=> {
				clearInterval( beat )
				stop_probe()
				setTimeout( ()=> {
					if( this.$.$giper_baza_yard.masters().length ) this.master_next()
					this.reconnects( null )
				}, delay )
			}

			port.destructor = ()=> {
				socket.onclose = ()=> {}
				clearInterval( beat )
				stop_probe()
				socket.close()
			}

			this.$.$mol_log3_come({
				place: this,
				message: 'Connected',
				port: $mol_key( port ),
				server: link,
			})

			return port
		}

		@ $mol_mem
		override master() {

			this.reconnects()

			const links = this.$.$giper_baza_yard.masters()
			if( !links.length ) return null

			const first = ( $mol_wire_probe( ()=> this.master_cursor() ) ?? 0 ) % links.length
			const order = links.map( ( _, index )=> ( first + index ) % links.length )

			const sockets = new Map< number, WebSocket >()
			const begins = new Map< number, number >()
			const timers = new Set< any >()
			let won = false
			let started = 0
			let failed = 0

			const stop = ( keep?: number )=> {
				for( const timer of timers ) clearTimeout( timer )
				timers.clear()
				for( const [ index, socket ] of sockets ) {
					if( index === keep ) continue
					socket.onopen = null
					socket.onerror = null
					socket.onclose = null
					socket.close()
				}
			}

			const promise = new Promise< $mol_rest_port >( done => {

				const next = ()=> {

					if( won || started >= order.length ) return

					const index = order[ started ++ ]
					const link = links[ index ]

					const socket = new this.$.$mol_dom_context.WebSocket( link.replace( /^http/, 'ws' ), [ '$giper_baza_yard_2' ] )
					socket.binaryType = 'arraybuffer'
					sockets.set( index, socket )
					begins.set( index, Date.now() )

					socket.onopen = ()=> {
						if( won ) return
						won = true
						stop( index )
						socket.onerror = null
						this.master_cursor( index )
						this.master_rtt( Date.now() - ( begins.get( index ) ?? Date.now() ) )
						done( this.port_make( socket, link ) )
					}

					socket.onerror = ()=> {

						socket.onopen = null
						socket.onerror = null
						if( won ) return

						if( ++ failed >= order.length ) {
							timers.add( setTimeout( ()=> this.reconnects( null ), 1000 ) )
							return
						}

						next()
					}

					if( started < order.length ) timers.add( setTimeout( next, ( this.constructor as typeof $bog_yard ).stagger ) )

				}

				next()

			} )

			return Object.assign( promise, { destructor: ()=> { if( !won ) stop() } } ) as any as $mol_rest_port
		}

		/**
		 * Раз в `probe_period` проверяет, не открывается ли какой-то мастер
		 * заметно быстрее текущего. Возвращает остановку проверок.
		 */
		probe_loop() {

			const period = ( this.constructor as typeof $bog_yard ).probe_period
			let stopped = false
			let timer = 0 as any

			const tick = async ()=> {

				if( stopped ) return

				try {
					if( await this.probe_check() ) return
				} catch( error ) {
					$mol_fail_log( error )
				}

				if( stopped ) return
				timer = setTimeout( tick, period )

			}

			timer = setTimeout( tick, period )

			return ()=> {
				stopped = true
				clearTimeout( timer )
			}

		}

		/**
		 * Переключается на мастера, который открывается заметно быстрее
		 * текущего. Так приложение уходит с зарубежного мастера на ближний,
		 * когда маршрут меняется, а сокет при этом не рвётся.
		 * Возвращает, переключился ли.
		 */
		@ $mol_action
		async probe_check() {

			const rtt = this.master_rtt()
			if( !rtt ) return false

			const current = this.master_cursor()
			const best = await this.probe_best( current )
			if( !best ) return false

			const margin = ( this.constructor as typeof $bog_yard ).switch_margin
			if( best.rtt + margin >= rtt ) return false

			const links = this.$.$giper_baza_yard.masters()

			this.$.$mol_log3_rise({
				place: this,
				message: 'Switch to faster master',
				from: links[ current ],
				to: links[ best.index ],
				rtt: [ rtt, best.rtt ],
			})

			this.master_cursor( best.index )
			this.master_rtt( best.rtt )
			this.reconnects( null )

			return true

		}

		/** Гоняет пробные сокеты по всем мастерам, кроме текущего, и отдаёт самого быстрого. */
		probe_best( exclude: number ) {

			const links = this.$.$giper_baza_yard.masters()
			const candidates = links
				.map( ( link, index )=> [ index, link ] as const )
				.filter( ( [ index ] )=> index !== exclude )

			if( !candidates.length ) return Promise.resolve( null as { index: number, rtt: number } | null )

			const timeout = ( this.constructor as typeof $bog_yard ).probe_timeout

			return new Promise< { index: number, rtt: number } | null >( done => {

				let left = candidates.length
				let best = null as { index: number, rtt: number } | null
				let finished = false

				const sockets = new Map< number, WebSocket >()

				const finish = ()=> {
					if( finished ) return
					finished = true
					clearTimeout( timer )
					for( const socket of sockets.values() ) {
						socket.onopen = null
						socket.onerror = null
						socket.close()
					}
					done( best )
				}

				const timer = setTimeout( finish, timeout )

				for( const [ index, link ] of candidates ) {

					const began = Date.now()
					const socket = new this.$.$mol_dom_context.WebSocket( link.replace( /^http/, 'ws' ), [ '$giper_baza_yard_2' ] )
					socket.binaryType = 'arraybuffer'
					sockets.set( index, socket )

					const settle = ()=> {
						if( -- left ) return
						finish()
					}

					socket.onopen = ()=> {
						const rtt = Date.now() - began
						if( !best || rtt < best.rtt ) best = { index, rtt }
						socket.onopen = null
						socket.onerror = null
						socket.close()
						settle()
					}

					socket.onerror = ()=> {
						socket.onopen = null
						socket.onerror = null
						settle()
					}

				}

			} )

		}

	}

}
