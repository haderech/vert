#include <eosio/eosio.hpp>

using namespace eosio;

class [[eosio::contract]] n122 : public contract {
public:
   using contract::contract;

   [[eosio::on_notify("*::send")]]
   void send(int64_t value)
   {
      print(" 9 ");

      require_recipient("n1221"_n);

      send_action i1222("i1222"_n, {get_self(), "active"_n});
      i1222.send(value);
   }

   using send_action = action_wrapper<"send"_n, &n122::send>;

   [[eosio::action]]
   void abc(int64_t value){}
};
