import React from 'react'
import logo from '../logo/logo.png';

const Header = () => {
  return (
    <section className='flex items-center justify-center w-full h-[20vh] select-none'>
        <img src={logo} alt="ChatMate Logo" className="h-20 w-40 select-none" draggable="false" />
    </section>
  )
}

export default Header